export interface DescricaoComando {
  prefixo: string;
  descricao: string;
  /** Só lê o estado do Docker: não muda nada por baixo. */
  consulta?: boolean;
}

const DESCRICOES: DescricaoComando[] = [
  {
    prefixo: 'docker compose up',
    descricao:
      'Sobe todos os serviços do docker-compose.yml de uma vez: constrói ou baixa as imagens, cria a rede e inicia os contêineres. Com -d, roda em segundo plano.'
  },
  { prefixo: 'docker compose down', descricao: 'Para e apaga os contêineres e a rede do projeto. As imagens continuam na máquina.' },
  { prefixo: 'docker compose ps', descricao: 'Lista os contêineres dos serviços do docker-compose.yml.', consulta: true },
  { prefixo: 'docker compose logs', descricao: 'Mostra a saída de todos os serviços juntos, cada linha com o nome do serviço.', consulta: true },
  {
    prefixo: 'docker pull',
    descricao: 'Baixa uma imagem do registry (Docker Hub) para a máquina. Não cria nem roda nada: só deixa a imagem pronta para uso.'
  },
  { prefixo: 'docker images', descricao: 'Lista as imagens que estão na máquina, com tag, ID e tamanho.', consulta: true },
  {
    prefixo: 'docker build',
    descricao: 'Cria uma imagem nova a partir de um Dockerfile.'
  },
  { prefixo: 'docker rmi', descricao: 'Apaga uma imagem da máquina.' },
  {
    prefixo: 'docker run',
    descricao:
      'Cria um contêiner a partir de uma imagem e já o inicia. -d roda em segundo plano, --name dá um nome e -p publica uma porta.'
  },
  { prefixo: 'docker ps', descricao: 'Lista os contêineres rodando. Com -a, inclui os parados.', consulta: true },
  { prefixo: 'docker start', descricao: 'Inicia de novo um contêiner que já existe e está parado.' },
  { prefixo: 'docker stop', descricao: 'Para um contêiner que está rodando. Ele continua existindo e pode ser iniciado de novo.' },
  { prefixo: 'docker restart', descricao: 'Para e inicia o contêiner de novo, por exemplo depois de mudar alguma configuração.' },
  {
    prefixo: 'docker logs',
    descricao: 'Mostra o que o contêiner escreveu na saída. É a primeira coisa a olhar quando algo dá errado.',
    consulta: true
  },
  { prefixo: 'docker exec', descricao: 'Roda um comando dentro de um contêiner que já está rodando, sem parar o processo principal.' },
  { prefixo: 'docker rm', descricao: 'Apaga um contêiner parado (com -f, mesmo rodando). A imagem continua na máquina.' }
];

export function descreverComando(comando: string): DescricaoComando | undefined {
  const normalizado = comando.replace(/^docker-compose /, 'docker compose ');
  return DESCRICOES.find(d => normalizado === d.prefixo || normalizado.startsWith(`${d.prefixo} `));
}
