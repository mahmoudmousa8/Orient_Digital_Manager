import fs from 'fs';
import readline from 'readline';

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:\\Users\\Mahmoud\\.gemini\\antigravity\\brain\\93627bdb-ed13-4792-acf2-d5e4916fbb01\\.system_generated\\logs\\transcript.jsonl');
  const writeStream = fs.createWriteStream('C:\\Users\\Mahmoud\\.gemini\\antigravity\\brain\\93627bdb-ed13-4792-acf2-d5e4916fbb01\\scratch\\full_history.txt');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let index = 1;
  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'USER_INPUT') {
        writeStream.write(`[USER REQUEST ${index++}]: ${obj.content}\n\n`);
      }
    } catch (e) {
      // ignore parse errors
    }
  }
  writeStream.end();
  console.log("Done extracting history to file!");
}

processLineByLine();
