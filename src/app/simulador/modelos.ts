export interface Camada {
  digest: string;
  tamanhoMB: number;
  instrucao: string;
}

export interface DefProcesso {
  usuario: string;
  comando: string;
  memoriaMB: number;
}

export interface Imagem {
  repositorio: string;
  tag: string;
  id: string;
  criadaEm: string;
  camadas: Camada[];
  comando: string;
  processos: DefProcesso[];
  diretorios: Record<string, string[]>;
}

export type EstadoContainer = 'running' | 'exited';

export interface Processo {
  pid: number;
  pidHost: number;
  usuario: string;
  comando: string;
  memoriaMB: number;
}

export interface Container {
  id: string;
  nome: string;
  imagem: Imagem;
  estado: EstadoContainer;
  criadoEm: Date;
  finalizadoEm?: Date;
  codigoSaida: number;
  oomKilled: boolean;
  limiteMemoriaMB?: number;
  ip?: string;
  processos: Processo[];
  proximoPid: number;
}

export interface PassoKernel {
  categoria: string;
  chamada: string;
  explicacao: string;
}

export interface OperacaoKernel {
  comando: string;
  passos: PassoKernel[];
}

export interface EventoDocker {
  hora: Date;
  tipo: 'image' | 'container';
  acao: string;
  alvo: string;
}

export type TipoLinha = 'saida' | 'erro' | 'info';

export interface LinhaSaida {
  texto: string;
  tipo: TipoLinha;
}

export const saida = (texto: string): LinhaSaida => ({ texto, tipo: 'saida' });
export const erro = (texto: string): LinhaSaida => ({ texto, tipo: 'erro' });
export const info = (texto: string): LinhaSaida => ({ texto, tipo: 'info' });

export class ErroDocker extends Error {}
