import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { exec } from 'node:child_process';

const PORT = 3001;
const PROJECT_ROOT = process.cwd();

function send(res: any, status: number, body: any) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

function scanModelDir(dir: string) {
  const dirName = basename(dir);
  const files = readdirSync(dir);
  const smd = files.filter(f => f.toLowerCase().endsWith('.smd'));
  const smb = files.filter(f => f.toLowerCase().endsWith('.smb'));
  const inx = files.filter(f => f.toLowerCase().endsWith('.inx'));
  const bmp = files.filter(f => f.toLowerCase().endsWith('.bmp'));

  // Check if a GLB with this name already exists in scripts/pt-port/
  const glbName = dirName.toLowerCase() + '.glb';
  const glbPath = join(PROJECT_ROOT, 'scripts', 'pt-port', glbName);
  const hasGlb = existsSync(glbPath);

  return {
    name: dirName,
    path: dir,
    smdCount: smd.length,
    smbCount: smb.length,
    inxCount: inx.length,
    bmpCount: bmp.length,
    glbName: hasGlb ? glbName : null,
  };
}

const server = createServer((req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (url.pathname === '/list-glbs') {
    const ptPortDir = join(PROJECT_ROOT, 'scripts', 'pt-port');
    try {
      const files = readdirSync(ptPortDir);
      const glbs = files.filter(f => f.toLowerCase().endsWith('.glb')).sort();
      send(res, 200, { glbs });
    } catch (e: any) {
      send(res, 500, { error: e.message, glbs: [] });
    }
    return;
  }

  if (url.pathname === '/scan') {
    const dir = url.searchParams.get('dir') || '';
    if (!dir || !existsSync(dir)) {
      send(res, 400, { error: 'Directory not found: ' + dir });
      return;
    }
    try {
      // If dir contains .smd files, treat it as a model directory
      const files = readdirSync(dir);
      const hasSmd = files.some(f => f.toLowerCase().endsWith('.smd'));
      if (hasSmd) {
        send(res, 200, { models: [scanModelDir(dir)] });
        return;
      }
      // Otherwise scan subdirectories for model directories
      const subdirs = files
        .filter(f => {
          try { return statSync(join(dir, f)).isDirectory(); } catch { return false; }
        })
        .filter(f => {
          try {
            const subFiles = readdirSync(join(dir, f));
            return subFiles.some(s => s.toLowerCase().endsWith('.smd'));
          } catch { return false; }
        })
        .sort();
      const models = subdirs.map(f => scanModelDir(join(dir, f)));
      send(res, 200, { models });
    } catch (e: any) {
      send(res, 500, { error: e.message });
    }
    return;
  }

  if (url.pathname === '/convert' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let parsed: { dir: string; outputName?: string };
      try { parsed = JSON.parse(body); } catch { send(res, 400, { error: 'Invalid JSON' }); return; }

      const dir = parsed.dir.replace(/\//g, '\\');
      if (!dir || !existsSync(dir)) { send(res, 400, { error: 'Directory not found: ' + dir }); return; }

      const dirName = basename(dir);
      const outputName = parsed.outputName || (dirName + '.glb');
      const outputPath = join('scripts/pt-port', outputName);

      const logs: { text: string; cls: string }[] = [];
      logs.push({ text: `Converting ${dirName} to ${outputName}`, cls: 'info' });

      // Normalize to forward slashes (Node.js handles these on Windows) and
      // ensure a trailing slash so glb_assembler's path concatenation works.
      const safeDir = parsed.dir.replace(/\\/g, '/').replace(/\/+$/, '') + '/';
      const cmd = `npx tsx scripts/pt-port/glb_assembler.ts "${safeDir}" "${outputPath}"`;

      exec(cmd, { cwd: PROJECT_ROOT }, (err, stdout, stderr) => {
        const allOutput = (stdout || '') + (stderr || '');
        if (allOutput.trim()) {
          allOutput.trim().split('\n').forEach((line: string) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const cls = trimmed.includes('failed') || trimmed.includes('Error') || trimmed.includes('error') ? 'error'
              : trimmed.includes('Written') ? 'success'
              : 'info';
            logs.push({ text: trimmed, cls });
          });
        }
        if (err) {
          logs.push({ text: 'Conversion failed: ' + (err.message || 'unknown error'), cls: 'error' });
          send(res, 500, { error: 'Conversion failed', logs });
        } else {
          const glbPath = join(PROJECT_ROOT, 'scripts', 'pt-port', outputName);
          const dieGlbPath = outputName.replace(/\.glb$/i, '-die.glb');
          const diePath = join(PROJECT_ROOT, 'scripts', 'pt-port', dieGlbPath);
          send(res, 200, {
            logs,
            glbPath: existsSync(glbPath) ? glbPath : null,
            dieGlbPath: existsSync(diePath) ? diePath : null,
          });
        }
      });
    });
    return;
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`PT Converter API running at http://localhost:${PORT}`);
  console.log(`Open scripts/pt-port/converter.html in your browser`);
});
