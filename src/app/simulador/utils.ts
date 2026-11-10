import { ErroDocker } from './modelos';

export function hexAleatorio(tamanho = 64): string {
  let s = '';
  for (let i = 0; i < tamanho; i++) {
    s += Math.floor(Math.random() * 16).toString(16);
  }
  return s;
}

export const idCurto = (id: string) => id.slice(0, 12);

/** Hash estável de 12 caracteres hex: o mesmo texto gera sempre o mesmo digest (base do cache do build). */
export function hashCurto(texto: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (const ch of texto) {
    a = Math.imul(a ^ ch.charCodeAt(0), 16777619);
    b = Math.imul(b ^ ch.charCodeAt(0), 2246822507);
  }
  return ((a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')).slice(0, 12);
}

export function duracaoHumana(ms: number): string {
  const segundos = Math.floor(ms / 1000);
  if (segundos < 1) return 'Less than a second';
  if (segundos === 1) return '1 second';
  if (segundos < 60) return `${segundos} seconds`;
  const minutos = Math.floor(segundos / 60);
  if (minutos === 1) return 'About a minute';
  if (minutos < 60) return `${minutos} minutes`;
  const horas = Math.round(ms / 3_600_000);
  if (horas === 1) return 'About an hour';
  if (horas < 48) return `${horas} hours`;
  if (horas < 24 * 14) return `${Math.floor(horas / 24)} days`;
  return `${Math.floor(horas / 24 / 7)} weeks`;
}

export const tempoAtras = (data: Date | string) => `${duracaoHumana(Date.now() - new Date(data).getTime())} ago`;

export const tamanho = (mb: number) =>
  mb < 1 ? `${parseFloat((mb * 1000).toPrecision(3))}kB` : `${parseFloat(mb.toPrecision(3))}MB`;

export function tabela(cabecalho: string[], linhas: string[][]): string[] {
  const larguras = cabecalho.map((c, i) => Math.max(c.length, ...linhas.map(l => l[i].length)));
  const formatar = (colunas: string[]) => colunas.map((c, i) => c.padEnd(larguras[i] + 3)).join('').trimEnd();
  return [formatar(cabecalho), ...linhas.map(formatar)];
}

const ADJETIVOS = ['brave', 'clever', 'eager', 'focused', 'happy', 'jolly', 'keen', 'modest', 'quirky', 'serene', 'sleepy', 'vibrant'];
const CIENTISTAS = ['curie', 'darwin', 'einstein', 'euler', 'hopper', 'knuth', 'lovelace', 'newton', 'tesla', 'torvalds', 'turing'];

export function nomeAleatorio(): string {
  const sortear = (lista: string[]) => lista[Math.floor(Math.random() * lista.length)];
  return `${sortear(ADJETIVOS)}_${sortear(CIENTISTAS)}`;
}
