// SnapGene stores type/length/data packets. Lengths are unsigned big-endian;
// the cookie is type 0x09 and DNA is type 0x00 (flags followed by ASCII bases).
// Format reference: Biopython Bio.SeqIO.SnapGeneIO.
const COOKIE = 'SnapGene';
const decoder = new TextDecoder('utf-8', { fatal: true });

export function hasSnapGeneSignature(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 13 && bytes[0] === 0x09 &&
    [...COOKIE].every((char, index) => bytes[index + 5] === char.charCodeAt(0));
}

export function parseSnapGeneSequence(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let offset = 0;
  let sequence: string | null = null;

  if (!hasSnapGeneSignature(buffer)) {
    throw new Error('不是有效的原生 SnapGene .dna 文件。');
  }

  while (offset < bytes.length) {
    if (bytes.length - offset < 5) {
      throw new Error('SnapGene 文件不完整：数据包头被截断。');
    }
    const type = bytes[offset];
    const length = view.getUint32(offset + 1, false);
    const dataStart = offset + 5;
    if (length > bytes.length - dataStart) {
      throw new Error('SnapGene 文件不完整：数据包内容被截断。');
    }

    if (offset === 0 && length !== 14) {
      throw new Error('SnapGene 文件头长度无效。');
    }

    if (type === 0x00) {
      if (sequence !== null) {
        throw new Error('SnapGene 文件包含多个 DNA 数据包，无法确定序列。');
      }
      if (length <= 1) {
        throw new Error('SnapGene 文件中的 DNA 序列为空。');
      }
      // The first data byte stores flags such as circular topology, not bases.
      const dna = decoder.decode(bytes.subarray(dataStart + 1, dataStart + length));
      if (!/^[ACGTRYSWKMBDHVNU]+$/i.test(dna)) {
        throw new Error('SnapGene DNA 数据包包含无效碱基。');
      }
      sequence = dna.toUpperCase();
    }
    offset = dataStart + length;
  }

  if (sequence === null) {
    throw new Error('SnapGene 文件未包含 DNA 序列数据包。');
  }
  return sequence;
}
