import { Injectable, inject, signal } from '@angular/core';
import { COMPOSE, ProjetoCompose } from './compose';
import { descreverComando } from './descricoes';
import { DockerEngineService } from './docker-engine.service';
import { Container, ErroDocker, LinhaSaida, erro, info, saida } from './modelos';
import { duracaoHumana, idCurto, tabela, tamanho, tempoAtras } from './utils';

export interface ResultadoCli {
  linhas: LinhaSaida[];
  limpar?: boolean;
}

interface Flags {
  valores: Map<string, string | true>;
  posicionais: string[];
}

function lerFlags(args: string[], booleanas: string[], comValor: string[] = [], pararNoPosicional = false): Flags {
  const valores = new Map<string, string | true>();
  const posicionais: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('-') || (pararNoPosicional && posicionais.length)) {
      posicionais.push(a);
      continue;
    }
    const [nome, valorIgual] = a.split(/=(.*)/);
    if (comValor.includes(nome)) {
      const valor = valorIgual ?? args[++i];
      if (valor === undefined) throw new ErroDocker(`a flag ${nome} precisa de um valor`);
      valores.set(nome, valor);
    } else if (booleanas.includes(nome)) {
      valores.set(nome, true);
    } else if (/^-[a-z]{2,}$/.test(a) && [...a.slice(1)].every(ch => booleanas.includes(`-${ch}`))) {
      [...a.slice(1)].forEach(ch => valores.set(`-${ch}`, true)); 
    } else {
      throw new ErroDocker(`unknown flag: ${a}`);
    }
  }
  return { valores, posicionais };
}

@Injectable({ providedIn: 'root' })
export class DockerCliService {
  private readonly engine = inject(DockerEngineService);
  private linhaAtual = '';

  readonly prompt = signal('user@host:~$').asReadonly();

  executar(linha: string): ResultadoCli {
    this.linhaAtual = linha.trim().replace(/\s+/g, ' ');
    const [comando, ...args] = this.linhaAtual.split(' ');
    try {
      switch (comando) {
        case 'clear':
          return { linhas: [], limpar: true };
        case 'help':
          return { linhas: this.ajuda() };
        case 'docker':
          return { linhas: this.registrando(() => this.docker(args)) };
        case 'docker-compose':
          return { linhas: this.registrando(() => this.compose(args)) };
        default:
          return { linhas: [erro(`${comando}: command not found`), info('Digite "help" para ver os comandos.')] };
      }
    } catch (e) {
      if (e instanceof ErroDocker) return { linhas: [erro(e.message)] };
      throw e;
    }
  }

  private docker([sub, ...args]: string[]): LinhaSaida[] {
    switch (sub) {
      case 'pull':
        return this.engine.pull(this.exigir(lerFlags(args, []).posicionais, 'docker pull IMAGEM')[0]);
      case 'images':
        return this.images();
      case 'build': {
        const f = lerFlags(args, [], ['-t', '--tag', '-f', '--file']);
        const [contexto] = this.exigir(f.posicionais, 'docker build [-f ARQUIVO] -t NOME .');
        if (contexto !== '.' && contexto !== './') {
          throw new ErroDocker(`unable to prepare context: path "${contexto}" not found (use . para a pasta atual)`);
        }
        const arquivo = (f.valores.get('-f') ?? f.valores.get('--file') ?? 'Dockerfile') as string;
        return this.engine.build(arquivo.replace(/^\.\//, ''), (f.valores.get('-t') ?? f.valores.get('--tag')) as string | undefined);
      }
      case 'rmi':
        return this.exigir(lerFlags(args, []).posicionais, 'docker rmi IMAGEM').flatMap(ref => this.engine.removerImagem(ref));
      case 'run':
        return this.run(args);
      case 'ps':
        return this.ps(lerFlags(args, ['-a', '--all']));
      case 'start':
        return this.paraCada(lerFlags(args, []).posicionais, 'docker start CONTAINER', c => this.engine.iniciar(c, this.linhaAtual));
      case 'stop':
        return this.paraCada(lerFlags(args, []).posicionais, 'docker stop CONTAINER', c => this.engine.parar(c, this.linhaAtual));
      case 'restart':
        return this.paraCada(lerFlags(args, []).posicionais, 'docker restart CONTAINER', c => this.engine.reiniciar(c, this.linhaAtual));
      case 'logs': {
        const f = lerFlags(args, ['-f', '--follow'], ['-n', '--tail']);
        const [ref] = this.exigir(f.posicionais, 'docker logs [--tail N] CONTAINER');
        const linhas = this.engine.logs(this.engine.buscarContainer(ref));
        const tail = (f.valores.get('-n') ?? f.valores.get('--tail')) as string | undefined;
        return tail ? linhas.slice(-Number(tail) || linhas.length) : linhas;
      }
      case 'compose':
        return this.compose(args);
      case 'rm': {
        const f = lerFlags(args, ['-f', '--force']);
        const forcar = f.valores.has('-f') || f.valores.has('--force');
        return this.paraCada(f.posicionais, 'docker rm [-f] CONTAINER', c => this.engine.remover(c, forcar));
      }
      case 'exec': {
        const f = lerFlags(args, ['-i', '-t'], [], true);
        const [ref, ...comando] = this.exigir(f.posicionais, 'docker exec CONTAINER COMANDO', 2);
        return this.engine.exec(this.engine.buscarContainer(ref), comando);
      }
      case undefined:
        return this.ajuda();
      default:
        throw new ErroDocker(`docker: '${sub}' is not a docker command. Digite "help" para ver os comandos.`);
    }
  }

  /** Garante que todo comando que deu certo apareça na aba do kernel, mesmo sem passos internos. */
  private registrando(executar: () => LinhaSaida[]): LinhaSaida[] {
    const antes = this.engine.ultimaOperacao();
    const linhas = executar();
    const mudou = this.engine.ultimaOperacao() !== antes;
    if (!mudou && !linhas.some(l => l.tipo === 'erro') && descreverComando(this.linhaAtual)) {
      this.engine.registrarOperacao(this.linhaAtual);
    }
    return linhas;
  }

  private exigir(posicionais: string[], uso: string, minimo = 1): string[] {
    if (posicionais.length < minimo) throw new ErroDocker(`uso: ${uso}`);
    return posicionais;
  }

  private paraCada(refs: string[], uso: string, acao: (c: Container) => unknown): LinhaSaida[] {
    return this.exigir(refs, uso).flatMap(ref => {
      try {
        const extras = acao(this.engine.buscarContainer(ref));
        return [saida(ref), ...(Array.isArray(extras) ? (extras as LinhaSaida[]) : [])];
      } catch (e) {
        if (e instanceof ErroDocker) return [erro(`Error response from daemon: ${e.message}`)];
        throw e;
      }
    });
  }

  private compose([sub, ...args]: string[]): LinhaSaida[] {
    const projeto = COMPOSE;
    switch (sub) {
      case 'up': {
        const f = lerFlags(args, ['-d', '--detach', '--build']);
        return this.engine.composeUp(projeto, f.valores.has('-d') || f.valores.has('--detach'));
      }
      case 'down':
        return this.engine.composeDown(projeto);
      case 'ps':
        return this.composePs(projeto);
      case 'logs':
        return this.composeLogs(projeto);
      default:
        throw new ErroDocker('uso: docker compose up [-d] | down | ps | logs');
    }
  }

  private composePs(projeto: ProjetoCompose): LinhaSaida[] {
    const containers = this.engine.containersDoProjeto(projeto).filter(c => c.estado === 'running');
    return tabela(
      ['NAME', 'IMAGE', 'SERVICE', 'STATUS', 'PORTS'],
      containers.map(c => [c.nome, `${c.imagem.repositorio}`, c.servico ?? '', this.status(c), this.portas(c)])
    ).map(saida);
  }

  private composeLogs(projeto: ProjetoCompose): LinhaSaida[] {
    const containers = this.engine.containersDoProjeto(projeto);
    const largura = Math.max(0, ...containers.map(c => `${c.servico}-1`.length));
    return containers.flatMap(c => this.engine.logs(c).map(l => saida(`${`${c.servico}-1`.padEnd(largura)}  | ${l.texto}`)));
  }

  private images(): LinhaSaida[] {
    return tabela(
      ['REPOSITORY', 'TAG', 'IMAGE ID', 'CREATED', 'SIZE'],
      this.engine.imagens().map(i => [
        i.repositorio,
        i.tag,
        i.id,
        tempoAtras(i.criadaEm),
        tamanho(i.camadas.reduce((t, c) => t + c.tamanhoMB, 0))
      ])
    ).map(saida);
  }

  private run(args: string[]): LinhaSaida[] {
    const f = lerFlags(args, ['-d', '--detach', '-i', '-t'], ['--name', '-p', '--publish']);
    const [imagem, ...extras] = this.exigir(f.posicionais, 'docker run [-d] [--name NOME] [-m 256m] IMAGEM');
    if (extras.length) throw new ErroDocker('o simulador não aceita comando depois da imagem (ex.: docker run -d nginx)');

    const porta = (f.valores.get('-p') ?? f.valores.get('--publish')) as string | undefined;
    if (porta && !/^\d+:\d+$/.test(porta)) throw new ErroDocker(`porta inválida: "${porta}" (use HOST:CONTÊINER, ex.: -p 8080:80)`);
    const { container, linhas } = this.engine.run(
      {
        imagem,
        nome: f.valores.get('--name') as string | undefined,
        portas: porta ? [porta] : []
      },
      this.linhaAtual
    );

    linhas.push(saida(container.id));
    if (container.estado === 'running' && !f.valores.has('-d') && !f.valores.has('--detach')) {
      linhas.push(info('Sem -d o terminal ficaria preso à saída do contêiner; aqui ele é liberado.'));
    }
    return linhas;
  }

  private ps(f: Flags): LinhaSaida[] {
    const todos = f.valores.has('-a') || f.valores.has('--all');
    const containers = this.engine.containers().filter(c => todos || c.estado === 'running').reverse();
    return tabela(
      ['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES'],
      containers.map(c => [
        idCurto(c.id),
        c.imagem.repositorio,
        `"${c.imagem.comando.length > 20 ? `${c.imagem.comando.slice(0, 19)}…` : c.imagem.comando}"`,
        tempoAtras(c.criadoEm),
        this.status(c),
        this.portas(c),
        c.nome
      ])
    ).map(saida);
  }

  private status(c: Container): string {
    if (c.estado === 'created') return 'Created';
    if (c.estado === 'running') return `Up ${duracaoHumana(Date.now() - (c.iniciadoEm ?? c.criadoEm).getTime())}`;
    return `Exited (${c.codigoSaida}) ${tempoAtras(c.finalizadoEm!)}`;
  }

  private portas(c: Container): string {
    if (c.estado !== 'running') return '';
    return c.portas.map(p => `0.0.0.0:${p.split(':')[0]}->${p.split(':')[1]}/tcp`).join(', ');
  }

  private ajuda(): LinhaSaida[] {
    const comandos: [string, string][] = [
      ['docker pull IMAGEM', 'baixa uma imagem (nginx, redis, ubuntu)'],
      ['docker images', 'lista as imagens'],
      ['docker build [-f ARQUIVO] -t NOME .', 'constrói uma imagem a partir de um Dockerfile'],
      ['docker rmi IMAGEM', 'remove uma imagem'],
      ['docker run IMAGEM', '[A FAZER] cria e inicia um contêiner'],
      ['docker ps', '[A FAZER] lista os contêineres'],
      ['docker start | stop | restart CONTAINER', '[A FAZER] inicia, para ou reinicia'],
      ['docker logs CONTAINER', '[A FAZER] mostra a saída do contêiner'],
      ['docker exec CONTAINER COMANDO', '[A FAZER] roda um comando dentro do contêiner'],
      ['docker rm CONTAINER', '[A FAZER] remove o contêiner'],
      ['docker compose up | down | ps | logs', '[A FAZER] sobe ou derruba os serviços do docker-compose.yml'],
      ['clear', 'limpa o terminal']
    ];
    const largura = Math.max(...comandos.map(([c]) => c.length));
    return comandos.map(([c, d]) => saida(`  ${c.padEnd(largura)}   ${d}`));
  }
}
