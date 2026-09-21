// Pläne per KI erfassen: Die App gibt einen fertigen Prompt aus (inklusive der
// eigenen Übungsliste, damit die KI exakt passende Namen verwendet). Die
// Antwort der KI wird hier wieder eingelesen.
//
// Bewusst ein Zeilenformat statt JSON: eine Antwort aus einem Chat enthält
// gern typografische Anführungszeichen, fehlende Kommas oder Code-Zäune –
// daran zerbricht JSON sofort, ein zeilenweises Format nicht. Übungszeilen
// müssen mit einem Aufzählungsstrich beginnen; erklärender Fließtext der KI
// wird dadurch schlicht ignoriert statt falsch gedeutet.

export const DEFAULT_SET_COUNT = 3;
const MAX_SETS = 12;

export function buildPlanPrompt(exercises, muscleGroups) {
  const byGroup = muscleGroups
    .map((group) => {
      const names = exercises.filter((e) => e.muscleGroup === group).map((e) => e.name);
      return names.length ? `${group}: ${names.join(', ')}` : '';
    })
    .filter(Boolean)
    .join('\n');

  return `Du hilfst mir, meine Trainingspläne für meine Gym-App zu erfassen.
Ich beschreibe dir gleich einen oder mehrere Pläne – per Text oder Sprachnachricht.

REGELN
1. Antworte ausschließlich mit dem Datenblock: keine Einleitung, keine Erklärung, keine Code-Zäune.
2. Jeder Plan beginnt mit einer eigenen Zeile: PLAN: <Name des Plans>
3. Danach pro Übung genau eine Zeile: - <Übungsname> | <Anzahl Sätze>
4. Verwende die Übungsnamen möglichst wortgleich aus der Liste "VERFÜGBARE ÜBUNGEN" unten.
5. Nur wenn eine Übung dort wirklich fehlt, schreib sie frei und häng die Muskelgruppe an:
   - <Übungsname> | <Anzahl Sätze> | <Muskelgruppe>
   Erlaubte Muskelgruppen: ${muscleGroups.join(', ')}
6. Nenne ich keine Satzzahl, nimm ${DEFAULT_SET_COUNT}.
7. Frag nicht nach, wenn etwas unklar ist – nimm die naheliegendste Übung aus der Liste.

BEISPIEL FÜR DIE ANTWORT
PLAN: Push
- Bankdrücken (Langhantel) | 3
- Schrägbankdrücken (Kurzhantel) | 3
- Seitheben (Kurzhantel) | 4
- Trizepsdrücken am Kabel (Seil) | 3

PLAN: Pull
- Klimmzüge (Obergriff) | 3
- Langhantelrudern | 4
- Bizepscurls (Kurzhantel) | 3

VERFÜGBARE ÜBUNGEN
${byGroup}

Antworte jetzt nur mit "Bereit." und warte auf meine Beschreibung.`;
}

// Namen vergleichbar machen: Groß/Klein, Umlaute, Klammern und Satzzeichen
// sollen keine Rolle spielen ("Bankdrücken (Langhantel)" ~ "bankdrucken langhantel").
export function normalizeExerciseName(name) {
  return String(name)
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

function cleanText(value) {
  return String(value)
    .replace(/\*\*/g, '')
    .replace(/[`"„“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '')
    .trim();
}

function parseSetCount(value) {
  const n = parseInt(String(value).replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SET_COUNT;
  return Math.min(n, MAX_SETS);
}

// Zerlegt eine Übungszeile in Name, Satzzahl und (optional) Muskelgruppe.
function parseExerciseLine(body) {
  const parts = body.split('|').map((p) => p.trim()).filter((p, i) => i === 0 || p !== '');

  if (parts.length >= 2) {
    return {
      name: cleanText(parts[0]),
      sets: parseSetCount(parts[1]),
      muscleGroup: parts[2] ? cleanText(parts[2]) : null,
    };
  }

  // Ohne Trennstrich: "Bankdrücken x 3" oder "Bankdrücken 3 Sätze"
  const text = cleanText(body);
  const trailing = text.match(/^(.*?)[\s,]+(?:[x×]\s*)?(\d{1,2})\s*(?:s[aä]tze|satz|sets?|x)?$/i);
  if (trailing && cleanText(trailing[1])) {
    return { name: cleanText(trailing[1]), sets: parseSetCount(trailing[2]), muscleGroup: null };
  }
  return { name: text, sets: DEFAULT_SET_COUNT, muscleGroup: null };
}

export function parsePlanText(text) {
  const plans = [];
  const warnings = [];
  let current = null;

  String(text ?? '').split(/\r?\n/).forEach((raw) => {
    const line = cleanText(raw.replace(/^#{1,6}\s*/, ''));
    if (!line) return;

    const header = line.match(/^plan\s*[:\-–]\s*(.+)$/i);
    if (header) {
      const name = cleanText(header[1]);
      current = { name: name || `Plan ${plans.length + 1}`, items: [] };
      plans.push(current);
      return;
    }

    const bullet = raw.trim().match(/^[-*•–—]\s*(.+)$/);
    if (!bullet) return; // Fließtext der KI ignorieren

    const item = parseExerciseLine(bullet[1]);
    if (!item.name) return;
    if (!current) {
      warnings.push(`"${item.name}" steht vor dem ersten "PLAN:" und wurde übersprungen.`);
      return;
    }
    if (current.items.some((i) => normalizeExerciseName(i.name) === normalizeExerciseName(item.name))) return;
    current.items.push(item);
  });

  const usable = plans.filter((p) => p.items.length);
  plans.filter((p) => !p.items.length).forEach((p) => warnings.push(`Plan "${p.name}" enthält keine Übungen.`));

  return { plans: usable, warnings };
}
