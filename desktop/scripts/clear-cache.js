#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

const id = 'com.longmemory.desktop.pet';
const dirs = [
  path.join(os.homedir(), 'Library', 'Caches', id),
  path.join(os.homedir(), 'Library', 'Application Support', id),
];

dirs.forEach((p) => {
  try {
    fs.rmSync(p, { recursive: true });
    console.log('已清除:', p);
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log('不存在(跳过):', p);
    } else {
      throw e;
    }
  }
});
console.log('桌面版缓存清理完成。请完全退出 LongMemory Pet 后重新打开。');
