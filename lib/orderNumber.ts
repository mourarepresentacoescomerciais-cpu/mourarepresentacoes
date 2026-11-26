/** Gera número de pedido no formato DDMMAAAAHHMM a partir de uma data.
 *  Exemplo: 290420262323 = 29/04/2026 23:23 */
export function generateOrderNumber(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getDate())}${pad(date.getMonth() + 1)}${date.getFullYear()}${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** Retorna o número formatado de um pedido (sem prefixo).
 *  Se o id já estiver no formato novo (12 dígitos), usa-o; senão, calcula a partir do createdAt. */
export function orderNumber(order: { id: string; createdAt: string }): string {
  return /^\d{12}$/.test(order.id) ? order.id : generateOrderNumber(new Date(order.createdAt));
}
