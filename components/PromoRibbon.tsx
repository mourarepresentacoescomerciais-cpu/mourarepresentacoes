import React from 'react';

interface PromoRibbonProps {
  className?: string;
  compact?: boolean;
  tiny?: boolean;
}

export const PromoRibbon: React.FC<PromoRibbonProps> = ({ className = '', compact = false, tiny = false }) => {
  if (tiny) {
    return (
      <div
        className={`promo-ribbon promo-ribbon-tiny ${className}`}
        aria-label="Promoção"
      >
        <span>PROMOÇÃO</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className={`promo-ribbon promo-ribbon-compact ${className}`}
        aria-label="Promoção"
      >
        <span>PROMOÇÃO</span>
      </div>
    );
  }

  return (
    <div
      className={`promo-ribbon promo-ribbon-default ${className}`}
      aria-label="Promoção"
    >
      <span>PROMOÇÃO</span>
    </div>
  );
};

export default PromoRibbon;
