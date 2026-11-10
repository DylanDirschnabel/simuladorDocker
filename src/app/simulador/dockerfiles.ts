import { DefProcesso } from './modelos';

export interface InstrucaoBuild {
  texto: string;
  /** 0 = instrução só de metadado (CMD, EXPOSE...), não gera camada. */
  tamanhoMB: number;
}

export interface Dockerfile {
  arquivo: string;
  /** Tag sugerida no docker build -t. */
  tag: string;
  base: string;
  instrucoes: InstrucaoBuild[];
  comando?: string;
  processos?: DefProcesso[];
  diretorios?: Record<string, string[]>;
  logs?: string[];
}

export const DOCKERFILES: Dockerfile[] = [
  {
    arquivo: 'Dockerfile',
    tag: 'site',
    base: 'nginx',
    instrucoes: [
      { texto: 'COPY index.html /usr/share/nginx/html/', tamanhoMB: 0.0012 },
      { texto: 'COPY nginx.conf /etc/nginx/conf.d/default.conf', tamanhoMB: 0.0008 },
      { texto: 'EXPOSE 80', tamanhoMB: 0 }
    ]
  },
  {
    arquivo: 'Dockerfile.app',
    tag: 'app',
    base: 'ubuntu',
    instrucoes: [
      { texto: 'RUN apt-get update && apt-get install -y curl', tamanhoMB: 45.2 },
      { texto: 'COPY app.sh /app/app.sh', tamanhoMB: 0.0004 },
      { texto: 'CMD ["/app/app.sh"]', tamanhoMB: 0 }
    ],
    comando: '/app/app.sh',
    processos: [{ usuario: 'root', comando: '/bin/sh /app/app.sh', memoriaMB: 1.2 }],
    diretorios: { '/app': ['app.sh'] },
    logs: ['app.sh: iniciando', 'app.sh: pronto, verificando a API a cada 30s']
  }
];

export function comandoBuild(d: Dockerfile): string {
  return `docker build ${d.arquivo === 'Dockerfile' ? '' : `-f ${d.arquivo} `}-t ${d.tag} .`;
}

export function textoDockerfile(d: Dockerfile): string[] {
  return [`FROM ${d.base}`, ...d.instrucoes.map(i => i.texto)];
}
