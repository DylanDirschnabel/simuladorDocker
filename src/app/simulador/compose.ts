export interface ServicoCompose {
  nome: string;
  imagem?: string;
  /** Nome do Dockerfile usado no build (ver dockerfiles.ts). */
  build?: string;
  portas?: string[];
  dependeDe?: string[];
}

export interface ProjetoCompose {
  /** Nome do projeto: o compose usa o nome da pasta onde está o arquivo (~ = /home/user). */
  nome: string;
  servicos: ServicoCompose[];
}

/** O único docker-compose.yml, que fica na pasta inicial (~). */
export const COMPOSE: ProjetoCompose = {
  nome: 'user',
  servicos: [
    { nome: 'cache', imagem: 'redis' },
    { nome: 'web', build: 'Dockerfile', portas: ['8080:80'], dependeDe: ['cache'] }
  ]
};

export function textoCompose(p: ProjetoCompose): string[] {
  const linhas = ['services:'];
  for (const s of p.servicos) {
    linhas.push(`  ${s.nome}:`);
    if (s.build === 'Dockerfile') linhas.push('    build: .');
    else if (s.build) linhas.push('    build:', '      context: .', `      dockerfile: ${s.build}`);
    if (s.imagem) linhas.push(`    image: ${s.imagem}`);
    if (s.portas?.length) linhas.push('    ports:', ...s.portas.map(porta => `      - "${porta}"`));
    if (s.dependeDe?.length) linhas.push('    depends_on:', ...s.dependeDe.map(d => `      - ${d}`));
  }
  return linhas;
}
