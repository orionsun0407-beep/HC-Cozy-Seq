import type { RefObject } from 'react';

interface QuickGuideProps {
  toolRef: RefObject<HTMLElement | null>;
}

const guideItems = [
  {
    title: 'BLASTP',
    body: '用于蛋白质模板和蛋白质 Query。若输入像 DNA，会提示切换到 BLASTX。',
    visual: 'P',
  },
  {
    title: 'BLASTX',
    body: '用于 DNA/CDS Query。系统会翻译 6 个阅读框，优先选择更合理的 Met 起始 ORF。',
    visual: 'X',
  },
  {
    title: '上传 FASTA',
    body: '模板只取第一个记录；Query 可多文件、多记录追加导入。',
    visual: 'FA',
  },
  {
    title: '设置颜色',
    body: '按模板氨基酸编号设置区间颜色。突变芯片、序列高亮和复制格式会保持一致。',
    visual: 'RGB',
  },
  {
    title: 'Copy formatted',
    body: '复制 FASTA 风格结果，富文本中保留突变颜色，纯文本仍可粘贴。',
    visual: 'CP',
  },
];

export function QuickGuide({ toolRef }: QuickGuideProps) {
  return (
    <section className="guide-section" aria-labelledby="guide-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Quick guide</p>
          <h2 id="guide-title">快速说明</h2>
        </div>
        <button className="button button--secondary" type="button" onClick={() => toolRef.current?.scrollIntoView({ behavior: 'smooth' })}>
          回到工具
        </button>
      </div>

      <div className="guide-grid">
        {guideItems.map((item) => (
          <article className="guide-card" key={item.title}>
            <div className="guide-visual" aria-hidden="true">
              <span>{item.visual}</span>
            </div>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
