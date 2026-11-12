// Writes the diagnosis reference outputs, one per real incident, to
// fixtures/diagnosis-references/<case>.json: the input of its test, the agent log read again, the
// output in the contract's form. The core (code-my-life/workflow-core) copies them to prove its port.
//
//   npm run export:diagnosis-references
//
// Two successive exports write the same bytes; diagnosisReferences.test.ts checks it.
import { relative } from 'node:path';
import { exportReferences } from '../apps/server/src/test/diagnosisReferences.ts';

for (const path of exportReferences()) console.log(`écrit ${relative(process.cwd(), path)}`);
