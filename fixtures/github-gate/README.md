# Commentaires de la gate de la factory

Deux vrais commentaires de la gate (`scripts/factory-gate.py` de hermes-software-factory), postés par l'App sur la PR factory-live#16 : un vert (`gate-vert.md`) et un rouge avec son extrait (`gate-rouge.md`). La recette des PR (#22) lit leurs règles dans ce format exact.

Seul changement : un tiret cadratin de la sortie de Vitest, dans l'extrait du rouge, est remplacé (règle `check:text`). Prettier ne touche pas ce dossier (`.prettierignore`) : le tableau garde la forme que la gate écrit.
