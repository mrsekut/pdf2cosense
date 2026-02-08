import { $ } from 'bun';
import { uploadToCosense } from './uploader.ts';
import { resolve } from 'path';
import { readdir } from 'fs/promises';

const WORKSPACE_DIR = './workspace';
const PDF_TO_JSON_DIR = './pdf-to-json';

async function runPdfToJson(): Promise<string[]> {
  console.log('📄 Running pdf-to-json (Rust)...');

  const result = await $`cd ${PDF_TO_JSON_DIR} && cargo run`.quiet();

  if (result.exitCode !== 0) {
    console.error('Failed to run pdf-to-json');
    console.error(result.stderr.toString());
    process.exit(1);
  }

  console.log(result.stdout.toString());

  // Find generated JSON files
  const files = await readdir(WORKSPACE_DIR);
  const jsonFiles = files
    .filter(f => f.endsWith('-ocr.json'))
    .map(f => resolve(WORKSPACE_DIR, f));

  return jsonFiles;
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json-only');
  const uploadOnly = args.includes('--upload-only');
  const projectName = args.find(a => a.startsWith('--project='))?.split('=')[1];

  let jsonFiles: string[] = [];

  // Step 1: Generate JSON (unless --upload-only)
  if (!uploadOnly) {
    jsonFiles = await runPdfToJson();
    console.log(`✅ Generated ${jsonFiles.length} JSON file(s)`);

    if (jsonOnly) {
      console.log('Done (--json-only mode)');
      return;
    }
  } else {
    // Find existing JSON files for upload
    const files = await readdir(WORKSPACE_DIR);
    jsonFiles = files
      .filter(f => f.endsWith('-ocr.json'))
      .map(f => resolve(WORKSPACE_DIR, f));
  }

  // Step 2: Upload to Cosense
  if (jsonFiles.length === 0) {
    console.log('No JSON files found to upload');
    return;
  }

  if (!projectName) {
    console.error('Please specify --project=<name> for upload');
    process.exit(1);
  }

  for (const jsonFile of jsonFiles) {
    console.log(`📤 Uploading ${jsonFile}...`);
    await uploadToCosense(jsonFile, projectName);
  }

  console.log('✅ All done!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
