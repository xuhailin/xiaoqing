import { Controller, Get, Param, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'node:path';
import * as fs from 'node:fs';

const ASSETS_ROOT = path.join(process.cwd(), 'assets');

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

@Controller('assets')
export class AssetsController {
  @Get(':folder/:file')
  serve(
    @Param('folder') folder: string,
    @Param('file') file: string,
    @Res() res: Response,
  ) {
    // Prevent path traversal
    if (folder.includes('..') || file.includes('..')) {
      return res.status(HttpStatus.BAD_REQUEST).send('Invalid path');
    }

    const filePath = path.join(ASSETS_ROOT, folder, file);

    // Ensure resolved path stays within ASSETS_ROOT
    if (!filePath.startsWith(ASSETS_ROOT)) {
      return res.status(HttpStatus.BAD_REQUEST).send('Invalid path');
    }

    if (!fs.existsSync(filePath)) {
      return res.status(HttpStatus.NOT_FOUND).send('Not found');
    }

    const ext = path.extname(file).toLowerCase();
    const mime = MIME_MAP[ext] ?? 'application/octet-stream';

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  }
}
