/** Validación y formato de RUN/RUT chileno (módulo 11). */

/** Quita puntos, espacios y guion; devuelve cuerpo + dv en mayúscula, o null si no tiene forma de RUT. */
export function parseRut(entrada: string): { cuerpo: string; dv: string } | null {
  const limpio = entrada.replace(/[.\s-]/g, '').toUpperCase();
  if (!/^\d{6,8}[\dK]$/.test(limpio)) return null;
  return { cuerpo: limpio.slice(0, -1), dv: limpio.slice(-1) };
}

export function calcularDv(cuerpo: string): string {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return '0';
  if (resto === 10) return 'K';
  return String(resto);
}

export function esRutValido(entrada: string): boolean {
  const r = parseRut(entrada);
  return r !== null && calcularDv(r.cuerpo) === r.dv;
}

/** Forma normalizada para API y FHIR: 12345678-5 (sin puntos). */
export function normalizarRut(entrada: string): string | null {
  const r = parseRut(entrada);
  return r && calcularDv(r.cuerpo) === r.dv ? `${r.cuerpo}-${r.dv}` : null;
}

/** Forma de presentación: 12.345.678-5. */
export function formatearRut(entrada: string): string {
  const r = parseRut(entrada);
  if (!r) return entrada;
  return `${r.cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${r.dv}`;
}

/** Enmascarado para listas: 12.345.***-5 (skill diseno-clinico-avis §1). */
export function enmascararRut(entrada: string): string {
  const r = parseRut(entrada);
  if (!r) return '***';
  return formatearRut(`${r.cuerpo}${r.dv}`).replace(/\.\d{3}-/, '.***-');
}

export function enmascararTelefono(tel: string): string {
  const d = tel.replace(/\D/g, '');
  return d.length >= 4 ? `+56 9 **** ${d.slice(-4)}` : '****';
}
