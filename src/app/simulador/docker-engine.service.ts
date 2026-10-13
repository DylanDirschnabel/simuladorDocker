import { Injectable, computed, signal } from '@angular/core';
import { Container, ErroDocker, EventoDocker, Imagem, LinhaSaida, OperacaoKernel, info, saida } from './modelos';
import { REGISTRY } from './registry';
import { analisarMemoria, hexAleatorio, idCurto, nomeAleatorio, tamanho } from './utils';

export const MEMORIA_HOST_MB = 7851;

export interface OpcoesRun {
  imagem: string;
  nome?: string;
  memoriaMB?: number;
}

function separarRef(ref: string): { repositorio: string; tag: string } {
  const [repositorio, tag = 'latest'] = ref.split(':');
  return { repositorio, tag };
}

@Injectable({ providedIn: 'root' })
export class DockerEngineService {
  private readonly _imagens: Imagem[] = [];
  private readonly _containers: Container[] = [];
  private proximoPidHost = 3100;
  private proximoIp = 2;
  private readonly revisao = signal(0);

  readonly imagens = computed(() => (this.revisao(), [...this._imagens]));
  readonly containers = computed(() => (this.revisao(), [...this._containers]));

  private readonly _ultimaOperacao = signal<OperacaoKernel | undefined>(undefined);
  private readonly _eventos = signal<EventoDocker[]>([]);
  readonly ultimaOperacao = this._ultimaOperacao.asReadonly();
  readonly eventos = this._eventos.asReadonly();

  readonly discoImagens = computed(() => {
    const camadas = new Map(this.imagens().flatMap(i => i.camadas.map(c => [c.digest, c.tamanhoMB] as const)));
    const usadoMB = [...camadas.values()].reduce((t, mb) => t + mb, 0);
    const semCompartilharMB = this.imagens().reduce((t, i) => t + i.camadas.reduce((s, c) => s + c.tamanhoMB, 0), 0);
    return { usadoMB, semCompartilharMB, camadasUnicas: camadas.size };
  });

  private notificar(): void {
    this.revisao.update(v => v + 1);
  }

  private registrarEvento(tipo: EventoDocker['tipo'], acao: string, alvo: string): void {
    this._eventos.update(l => [...l, { hora: new Date(), tipo, acao, alvo }]);
  }

  buscarImagem(ref: string): Imagem | undefined {
    const { repositorio, tag } = separarRef(ref);
    return this._imagens.find(i => (i.repositorio === repositorio && i.tag === tag) || i.id.startsWith(ref));
  }

  pull(ref: string): LinhaSaida[] {
    const { repositorio, tag } = separarRef(ref);
    const remota = REGISTRY.find(i => i.repositorio === repositorio && i.tag === tag);
    if (!remota) {
      throw new ErroDocker(
        `imagem "${ref}" não existe no registry do simulador (disponíveis: ${REGISTRY.map(i => i.repositorio).join(', ')})`
      );
    }

    const linhas = [`${tag}: Pulling from library/${repositorio}`];
    const manifesto = {
      categoria: 'registry',
      chamada: `GET /v2/library/${repositorio}/manifests/${tag}`,
      explicacao: 'Busca o manifesto: a lista de camadas que formam a imagem.'
    };
    this.registrarEvento('image', 'pull', `${repositorio}:${tag}`);

    if (this._imagens.includes(remota)) {
      linhas.push(`Status: Image is up to date for ${repositorio}:${tag}`);
      this._ultimaOperacao.set({
        comando: `docker pull ${ref}`,
        passos: [
          manifesto,
          { categoria: 'sistema de arquivos', chamada: 'nada a gravar', explicacao: 'Todas as camadas já estão no disco: a imagem está atualizada.' }
        ]
      });
      return linhas.map(saida);
    }

    const existentes = new Set(this._imagens.flatMap(i => i.camadas.map(c => c.digest)));
    const reaproveitadas = remota.camadas.filter(c => existentes.has(c.digest));
    const novas = remota.camadas.filter(c => !existentes.has(c.digest));
    for (const camada of remota.camadas) {
      linhas.push(`${camada.digest}: ${existentes.has(camada.digest) ? 'Already exists' : 'Pull complete'}`);
    }
    linhas.push(`Status: Downloaded newer image for ${repositorio}:${tag}`);

    const passos = [manifesto];
    if (reaproveitadas.length) {
      passos.push({
        categoria: 'reaproveitamento',
        chamada: `stat overlay2/${reaproveitadas.map(c => c.digest).join(', ')}`,
        explicacao:
          reaproveitadas.length === 1
            ? 'Uma camada já estava no disco e não precisou ser baixada.'
            : `${reaproveitadas.length} camadas já estavam no disco e não precisaram ser baixadas.`
      });
    }
    passos.push(
      {
        categoria: 'sistema de arquivos',
        chamada: 'mkdir + tar -x em overlay2/<camada>/diff',
        explicacao: `Baixa e descompacta ${novas.length} ${novas.length === 1 ? 'camada nova' : 'camadas novas'} (${tamanho(novas.reduce((t, c) => t + c.tamanhoMB, 0))}).`
      },
      {
        categoria: 'registro',
        chamada: 'write repositories.json',
        explicacao: `Registra ${repositorio}:${tag} (${remota.id}) na lista local de imagens.`
      }
    );
    this._ultimaOperacao.set({ comando: `docker pull ${ref}`, passos });
    this._imagens.push(remota);
    this.notificar();
    return linhas.map(saida);
  }

  buscarContainer(ref: string): Container {
    const c = this._containers.find(x => x.nome === ref) ?? this._containers.find(x => x.id.startsWith(ref));
    if (!c) throw new ErroDocker(`No such container: ${ref}`);
    return c;
  }

  run(op: OpcoesRun): { container: Container; linhas: LinhaSaida[] } {
    const linhas: LinhaSaida[] = [];
    let imagem = this.buscarImagem(op.imagem);
    if (!imagem) {
      linhas.push(saida(`Unable to find image '${op.imagem}' locally`), ...this.pull(op.imagem));
      imagem = this.buscarImagem(op.imagem)!;
    }

    if (op.nome && this._containers.some(c => c.nome === op.nome)) {
      throw new ErroDocker(`Conflict. The container name "/${op.nome}" is already in use.`);
    }
    let nome = op.nome;
    while (!nome || this._containers.some(c => c.nome === nome)) nome = nomeAleatorio();

    const container: Container = {
      id: hexAleatorio(),
      nome,
      imagem,
      estado: 'running',
      criadoEm: new Date(),
      codigoSaida: 0,
      oomKilled: false,
      limiteMemoriaMB: op.memoriaMB,
      ip: `172.17.0.${this.proximoIp++}`,
      processos: [],
      proximoPid: 1
    };
    for (const p of imagem.processos) {
      container.processos.push({ ...p, pid: container.proximoPid++, pidHost: this.novoPidHost() });
    }
    this._containers.push(container);

    if (!container.processos.length) {
      this.finalizar(container, 0);
      linhas.push(
        info(`O ${imagem.comando} não tem o que fazer sem um terminal: terminou na hora e o contêiner saiu (Exited 0).`)
      );
    }
    this.notificar();
    return { container, linhas };
  }

  parar(c: Container): void {
    if (c.estado === 'running') {
      this.finalizar(c, 0);
      this.notificar();
    }
  }

  remover(c: Container, forcar: boolean): void {
    if (c.estado === 'running' && !forcar) {
      throw new ErroDocker(
        `cannot remove container "/${c.nome}": container is running: stop the container before removing or force remove`
      );
    }
    this._containers.splice(this._containers.indexOf(c), 1);
    this.notificar();
  }

  private finalizar(c: Container, codigo: number): void {
    c.estado = 'exited';
    c.codigoSaida = codigo;
    c.finalizadoEm = new Date();
    c.processos = [];
    c.ip = undefined;
  }

  private novoPidHost(): number {
    this.proximoPidHost += 1 + Math.floor(Math.random() * 20);
    return this.proximoPidHost;
  }

  exec(c: Container, [comando, ...args]: string[]): LinhaSaida[] {
    if (c.estado !== 'running') throw new ErroDocker(`container ${idCurto(c.id)} is not running`);

    switch (comando) {
      case 'ps': {
        const ps = { pid: c.proximoPid++, usuario: 'root', comando: 'ps' };
        return [
          '  PID USER     COMMAND',
          ...[...c.processos, ps].map(p => `${String(p.pid).padStart(5)} ${p.usuario.padEnd(8)} ${p.comando}`)
        ].map(saida);
      }
      case 'hostname':
        return [saida(idCurto(c.id))];
      case 'ls': {
        const dir = args[0] ?? '/';
        const itens = c.imagem.diretorios[dir];
        if (!itens) throw new ErroDocker(`ls: cannot access '${dir}': No such file or directory`);
        return itens.length ? [saida(itens.join('  '))] : [];
      }
      case 'ip':
        return [
          '1: lo: <LOOPBACK,UP> mtu 65536',
          '    inet 127.0.0.1/8 scope host lo',
          '2: eth0: <BROADCAST,MULTICAST,UP> mtu 1500',
          `    inet ${c.ip}/16 scope global eth0`
        ].map(saida);
      case 'stress':
        return this.stress(c, args[0]);
      default:
        throw new ErroDocker(`comando "${comando}" não é simulado. Disponíveis no exec: ps, hostname, ls, ip addr, stress`);
    }
  }

  private stress(c: Container, quantidade?: string): LinhaSaida[] {
    if (!quantidade) throw new ErroDocker('uso: stress <memória>, ex.: stress 300m');
    const memoriaMB = analisarMemoria(quantidade);
    c.processos.push({
      pid: c.proximoPid++,
      pidHost: this.novoPidHost(),
      usuario: 'root',
      comando: `stress --vm-bytes ${quantidade}`,
      memoriaMB
    });

    const uso = c.processos.reduce((total, p) => total + p.memoriaMB, 0);
    const limite = c.limiteMemoriaMB ?? MEMORIA_HOST_MB;
    if (uso > limite) {
      c.oomKilled = true;
      this.finalizar(c, 137);
      this.notificar();
      return [
        saida('Killed'),
        info(
          `OOM killer: o contêiner tentou usar ${Math.round(uso)}MiB com limite de ${Math.round(limite)}MiB (cgroup). ` +
            'O kernel matou os processos e o contêiner saiu com código 137.'
        )
      ];
    }
    this.notificar();
    return [info(`O stress está segurando ${quantidade} de memória (${Math.round(uso)}MiB de ${Math.round(limite)}MiB usados).`)];
  }
}
