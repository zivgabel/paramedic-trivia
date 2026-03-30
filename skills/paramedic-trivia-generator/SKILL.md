---
name: paramedic-trivia-generator
description: "Generate bilingual Hebrew/English trivia questions from paramedic course PDFs for the Paramedic Trivia game. Use this skill whenever the user uploads a PDF and wants to generate trivia questions from it, or mentions adding questions to the trivia game, or says something like 'add this material to the game' or 'generate questions from this PDF'. Also trigger when the user mentions 'trivia', 'quiz questions', or 'שאלות טריוויה'."
---

# Paramedic Trivia Question Generator

You are generating bilingual trivia questions from paramedic course material (PDFs) for a web-based trivia game. The game expects questions in a specific JSON format that can be imported directly via the admin panel.

## Workflow

1. **Extract text from the PDF** — Use `pdftotext` (poppler) or `pdfplumber` to extract text. The PDFs are typically in Hebrew with some English medical terms. Handle RTL text gracefully.

2. **Identify the subject** — Determine what medical subject the PDF covers. Choose an existing subject ID if it matches, or create a new one. Use lowercase_snake_case for IDs.

   Existing subjects in the game:
   - `water_electrolytes` — משק המים והאלקטרוליטים
   - `oxygen` — החמצן
   - `acid_base` — מאזן חומצה-בסיס
   - `aed` — דפיברילטור AED
   - `legal` — היבטים משפטיים
   - `lung_volumes` — נפחי ריאה
   - `cpr_intro` — מבוא להחייאה
   - `electrophysiology` — אלקטרופיזיולוגיה של הלב
   - `medical_terminology` — מושגי יסוד וטרמינולוגיה
   - `respiratory_anatomy` — אנטומיה של מערכת הנשימה
   - `chemistry` — מבוא לכימיה
   - `body_structure` — מבנה הגוף
   - `blood_vessels` — כלי דם
   - `urinary_system` — מערכת השתן
   - `cell_respiration` — נשימה תאית
   - `nervous_system` — מערכת העצבים
   - `cardiovascular` — מערכת הקרדיווסקולארית

3. **Generate 8-12 questions per PDF** — Create a mix of `multiple_choice` (4 options) and `true_false` questions. Aim for roughly 70% multiple choice and 30% true/false.

4. **Output the JSON** — Save the questions as a JSON file that can be directly pasted into the admin panel's "Import JSON" feature.

## Question Quality Guidelines

Good paramedic trivia questions should:
- Test understanding, not just memorization — ask "why" and "what happens if" rather than just "what is"
- Cover the key clinical concepts a paramedic needs to know
- Include realistic distractors (wrong answers) that represent common misconceptions
- Vary in difficulty — mix straightforward recall with application-level thinking
- Use proper medical terminology in both Hebrew and English
- Include brief but informative explanations that reinforce learning

Avoid:
- Overly trivial questions ("What color is an ambulance?")
- Questions that depend on specific page numbers or slide references
- Ambiguous questions with multiple defensible answers
- Questions where the answer is obvious from the phrasing

## Output JSON Format

```json
[
  {
    "subject_id": "nervous_system",
    "subject_name_he": "מערכת העצבים",
    "subject_name_en": "Nervous System",
    "type": "multiple_choice",
    "question_he": "מהו התפקיד העיקרי של מערכת העצבים הסימפתטית?",
    "question_en": "What is the main function of the sympathetic nervous system?",
    "options_he": [
      "תגובת לחימה או בריחה",
      "עיכול מזון",
      "שינה ומנוחה",
      "ייצור הורמונים"
    ],
    "options_en": [
      "Fight or flight response",
      "Food digestion",
      "Sleep and rest",
      "Hormone production"
    ],
    "correct": 0,
    "explanation_he": "מערכת העצבים הסימפתטית אחראית על תגובת הלחימה או הבריחה, המכינה את הגוף למצבי חירום.",
    "explanation_en": "The sympathetic nervous system is responsible for the fight or flight response, preparing the body for emergency situations."
  },
  {
    "subject_id": "nervous_system",
    "subject_name_he": "מערכת העצבים",
    "subject_name_en": "Nervous System",
    "type": "true_false",
    "question_he": "מערכת העצבים המרכזית כוללת את המוח וחוט השדרה.",
    "question_en": "The central nervous system includes the brain and spinal cord.",
    "correct": true,
    "explanation_he": "נכון. מערכת העצבים המרכזית (CNS) מורכבת מהמוח וחוט השדרה.",
    "explanation_en": "Correct. The central nervous system (CNS) consists of the brain and spinal cord."
  }
]
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subject_id` | string | Yes | Snake_case subject identifier |
| `subject_name_he` | string | Yes | Hebrew subject name |
| `subject_name_en` | string | Yes | English subject name |
| `type` | string | Yes | `"multiple_choice"` or `"true_false"` |
| `question_he` | string | Yes | Question text in Hebrew |
| `question_en` | string | Yes | Question text in English |
| `options_he` | string[] | MC only | 4 Hebrew answer options |
| `options_en` | string[] | MC only | 4 English answer options |
| `correct` | number/boolean | Yes | Index 0-3 for MC, true/false for TF |
| `explanation_he` | string | Yes | Hebrew explanation of the answer |
| `explanation_en` | string | Yes | English explanation of the answer |

## After Generating

After writing the JSON file, tell the user:
1. How many questions were generated and for which subject
2. That they can import these directly via the admin panel at `/admin` → "Import JSON" tab
3. Or they can use the API: `POST /api/admin/import` with `{"questions": [...]}` (requires admin auth)
