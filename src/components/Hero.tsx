import type { RefObject } from 'react';

interface HeroProps {
  toolRef: RefObject<HTMLElement | null>;
  guideRef: RefObject<HTMLElement | null>;
}

export function Hero({ toolRef, guideRef }: HeroProps) {
  const scrollTo = (ref: RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <header className="hero">
      <div className="hero__overlay" />
      <nav className="topbar" aria-label="Main">
        <span className="brand-mark">HC</span>
        <span className="brand-name">HC CozySeq</span>
      </nav>
      <div className="hero__content">
        <p className="eyebrow">Local browser sequence analysis</p>
        <h1>HC CozySeq</h1>
        <p className="subtitle">Protein sequence comparison, translation-aware mutation calling, and batch mutation analysis</p>
        <div className="hero__actions">
          <button className="button button--primary" type="button" onClick={() => scrollTo(toolRef)}>
            开始比对
          </button>
          <button className="button button--secondary" type="button" onClick={() => scrollTo(guideRef)}>
            查看说明
          </button>
        </div>
      </div>
    </header>
  );
}
