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
  /** Linhas que o processo principal escreve ao subir (docker logs). */
  logs?: string[];
}

export type EstadoContainer = 'created' | 'running' | 'exited';

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
  iniciadoEm?: Date;
  finalizadoEm?: Date;
  codigoSaida: number;
  ip?: string;
  processos: Processo[];
  proximoPid: number;
  /** Mapeamentos "host:contêiner", como no -p. */
  portas: string[];
  logs: string[];
  /** Preenchidos quando o contêiner foi criado pelo docker compose. */
  projeto?: string;
  servico?: string;
}

export interface PassoKernel {
  categoria: string;
  resumo: string;
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
