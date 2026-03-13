import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class WechatWorkCryptoService {
  decrypt(encodingAesKey: string, encryptedMsg: string): string {
    const aesKey = Buffer.from(encodingAesKey + '=', 'base64');
    const encryptedBuffer = Buffer.from(encryptedMsg, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, aesKey.slice(0, 16));
    decipher.setAutoPadding(false);

    const decrypted = this.pkcs7Decode(Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]));

    const content = decrypted.slice(16);
    const msgLen = content.readUInt32BE(0);
    return content.slice(4, msgLen + 4).toString();
  }

  encrypt(encodingAesKey: string, text: string, corpId: string): string {
    const aesKey = Buffer.from(encodingAesKey + '=', 'base64');
    const random = crypto.randomBytes(16);
    const msgLen = Buffer.alloc(4);
    msgLen.writeUInt32BE(Buffer.byteLength(text), 0);

    const raw = Buffer.concat([random, msgLen, Buffer.from(text), Buffer.from(corpId)]);
    const padded = this.pkcs7Encode(raw);

    const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, aesKey.slice(0, 16));
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
  }

  private pkcs7Encode(buffer: Buffer): Buffer {
    const blockSize = 32;
    const padLength = blockSize - (buffer.length % blockSize);
    const padded = Buffer.alloc(buffer.length + padLength);
    buffer.copy(padded);
    padded.fill(padLength, buffer.length);
    return padded;
  }

  private pkcs7Decode(buffer: Buffer): Buffer {
    const padLength = buffer[buffer.length - 1];
    return buffer.slice(0, buffer.length - padLength);
  }
}
