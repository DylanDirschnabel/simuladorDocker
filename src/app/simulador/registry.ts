import { Imagem } from './modelos';

const DEBIAN = { digest: '541e681c0aa5', tamanhoMB: 74.8, instrucao: 'debian:bookworm-slim' };

const RAIZ = ['bin', 'boot', 'dev', 'etc', 'home', 'lib', 'media', 'mnt', 'opt', 'proc', 'root', 'run', 'sbin', 'srv', 'sys', 'tmp', 'usr', 'var'];

export const REGISTRY: Imagem[] = [
  {
    repositorio: 'nginx',
    tag: 'latest',
    id: '605c77e624dd',
    criadaEm: '2026-09-29T18:42:11Z',
    camadas: [
      DEBIAN,
      { digest: '5b1732bed8a6', tamanhoMB: 112.3, instrucao: 'RUN apt install nginx' },
      { digest: '4693be04689b', tamanhoMB: 0.0016, instrucao: 'COPY docker-entrypoint.sh' },
      { digest: 'cd78b836a8bf', tamanhoMB: 0.0022, instrucao: 'COPY docker-entrypoint.d/' }
    ],
    comando: '/docker-entrypoint.sh nginx -g daemon off;',
    processos: [
      { usuario: 'root', comando: 'nginx: master process nginx -g daemon off;', memoriaMB: 5.8 },
      { usuario: 'nginx', comando: 'nginx: worker process', memoriaMB: 2.4 },
      { usuario: 'nginx', comando: 'nginx: worker process', memoriaMB: 2.4 }
    ],
    diretorios: {
      '/': [...RAIZ, 'docker-entrypoint.d', 'docker-entrypoint.sh'].sort(),
      '/usr/share/nginx/html': ['50x.html', 'index.html']
    }
  },
  {
    repositorio: 'redis',
    tag: 'latest',
    id: '7614ae9453d1',
    criadaEm: '2026-09-25T09:15:47Z',
    camadas: [
      DEBIAN,
      { digest: '9c04587c5710', tamanhoMB: 1.4, instrucao: 'RUN apt install gosu' },
      { digest: 'b92a893b7a9b', tamanhoMB: 40.9, instrucao: 'RUN make install (redis)' },
      { digest: '6f782338d982', tamanhoMB: 0.0011, instrucao: 'COPY docker-entrypoint.sh' }
    ],
    comando: 'docker-entrypoint.sh redis-server',
    processos: [{ usuario: 'redis', comando: 'redis-server *:6379', memoriaMB: 3.6 }],
    diretorios: {
      '/': [...RAIZ, 'data'].sort(),
      '/data': []
    }
  },
  {
    repositorio: 'ubuntu',
    tag: 'latest',
    id: 'ba6acccedd29',
    criadaEm: '2026-09-17T06:03:22Z',
    camadas: [{ digest: 'c61106a5a4ed', tamanhoMB: 78.1, instrucao: 'ubuntu:24.04' }],
    comando: '/bin/bash',
    processos: [],
    diretorios: { '/': RAIZ }
  }
];
