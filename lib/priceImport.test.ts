import { expect, it } from 'vitest';
import { parsePriceRows } from './priceImport';
it('imports quoted Brazilian prices with cents', () => {
  expect(parsePriceRows('codigo;preco\n"63670";"1.476,47"')).toEqual([{ code: '63670', price: 1476.47 }]);
});
it('preserves decimal-point cents instead of multiplying prices by 100', () => {
  expect(parsePriceRows('codigo,preco\n63670,1246.24')).toEqual([{ code: '63670', price: 1246.24 }]);
});