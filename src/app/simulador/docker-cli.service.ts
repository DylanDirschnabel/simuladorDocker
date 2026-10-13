import { Injectable, inject } from '@angular/core';
import { DockerEngineService } from './docker-engine.service';
import { Container, ErroDocker, LinhaSaida, erro, info, saida } from './modelos';
import { analisarMemoria, duracaoHumana, idCurto, tabela, tamanho, tempoAtras } from './utils';

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

  executar(linha: string): ResultadoCli {
    const [comando, ...args] = linha.trim().split(/\s+/);
    try {
      switch (comando) {
        case 'clear':
          return { linhas: [], limpar: true };
        case 'help':
          return { linhas: this.ajuda() };
        case 'docker':
          return { linhas: this.docker(args) };
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
      case 'run':
        return this.run(args);
      case 'ps':
        return this.ps(lerFlags(args, ['-a', '--all']));
      case 'stop':
        return this.paraCada(lerFlags(args, []).posicionais, 'docker stop CONTAINER', c => this.engine.parar(c));
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

  private exigir(posicionais: string[], uso: string, minimo = 1): string[] {
    if (posicionais.length < minimo) throw new ErroDocker(`uso: ${uso}`);
    return posicionais;
  }

  private paraCada(refs: string[], uso: string, acao: (c: Container) => void): LinhaSaida[] {
    return this.exigir(refs, uso).map(ref => {
      try {
        acao(this.engine.buscarContainer(ref));
        return saida(ref);
      } catch (e) {
        if (e instanceof ErroDocker) return erro(`Error response from daemon: ${e.message}`);
        throw e;
      }
    });
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
    const f = lerFlags(args, ['-d', '--detach', '-i', '-t'], ['--name', '-m', '--memory']);
    const [imagem, ...extras] = this.exigir(f.posicionais, 'docker run [-d] [--name NOME] [-m 256m] IMAGEM');
    if (extras.length) throw new ErroDocker('o simulador não aceita comando depois da imagem (ex.: docker run -d nginx)');

    const memoria = (f.valores.get('-m') ?? f.valores.get('--memory')) as string | undefined;
    const { container, linhas } = this.engine.run({
      imagem,
      nome: f.valores.get('--name') as string | undefined,
      memoriaMB: memoria ? analisarMemoria(memoria) : undefined
    });

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
      ['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'NAMES'],
      containers.map(c => [
        idCurto(c.id),
        c.imagem.repositorio,
        `"${c.imagem.comando.length > 20 ? `${c.imagem.comando.slice(0, 19)}…` : c.imagem.comando}"`,
        tempoAtras(c.criadoEm),
        c.estado === 'running'
          ? `Up ${duracaoHumana(Date.now() - c.criadoEm.getTime())}`
          : `Exited (${c.codigoSaida}) ${tempoAtras(c.finalizadoEm!)}`,
        c.nome
      ])
    ).map(saida);
  }

  private ajuda(): LinhaSaida[] {
    const comandos: [string, string][] = [
      ['docker pull IMAGEM', 'baixa uma imagem (nginx, redis, ubuntu)'],
      ['docker images', 'lista as imagens baixadas'],
      ['docker run [-d] [--name NOME] [-m 256m] IMAGEM', 'cria e inicia um contêiner'],
      ['docker ps [-a]', 'lista os contêineres (-a inclui os parados)'],
      ['docker stop CONTAINER', 'para o contêiner'],
      ['docker rm [-f] CONTAINER', 'remove o contêiner'],
      ['docker exec CONTAINER COMANDO', 'roda ps, hostname, ls, ip addr ou stress 300m'],
      ['clear', 'limpa o terminal']
    ];
    const largura = Math.max(...comandos.map(([c]) => c.length));
    return comandos.map(([c, d]) => saida(`  ${c.padEnd(largura)}   ${d}`));
  }
}
