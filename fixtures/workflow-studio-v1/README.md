# API du studio, version 1

Vraies réponses de l'API générique de video-factory (son ADR 0006), lues par `WorkflowApi` (ADR 0014) :

- `workflow.json` : `GET /api/workflow` du studio qui tourne sur ce PC (`vf studio serve`, 2026-11-05) ;
- `items.json`, `item-essai.json`, `words-essai.json` : `GET /api/items`, `/api/items/essai` et `/api/items/essai/words`, servis par le vrai serveur du studio sur le tableau factice de ses tests (`tests/test_api.py`), une vidéo montée en revue et une autre en échec au montage ;
- `gesture-refused.json`, `gesture-ok.json` : le statut et le corps de `POST /api/items/essai/gesture` pour une décision inconnue, puis pour « refaire » avec sa raison.

Rien n'est à anonymiser : les vidéos viennent du gabarit de `vf new`, les cartes et les heures du tableau factice.
