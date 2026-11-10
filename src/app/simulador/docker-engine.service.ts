import { Injectable, computed, signal } from '@angular/core';
import { ProjetoCompose } from './compose';
import { DOCKERFILES } from './dockerfiles';
import { Camada, Container, ErroDocker, EventoDocker, Imagem, LinhaSaida, OperacaoKernel, PassoKernel, info, saida } from './modelos';
import { REGISTRY } from './registry';
import { hashCurto, hexAleatorio, idCurto, nomeAleatorio, tamanho } from './utils';

export interface OpcoesRun {
  imagem: string;
  nome?: string;
  portas?: string[];
  projeto?: string;
  servico?: string;
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
  private readonly cacheBuild = new Set<string>();
  private readonly revisao = signal(0);

  readonly imagens = computed(() => (this.revisao(), [...this._imagens]));
  readonly containers = computed(() => (this.revisao(), [...this._containers]));

  private readonly _ultimaOperacao = signal<OperacaoKernel | undefined>(undefined);
  private readonly _eventos = signal<EventoDocker[]>([]);
  readonly ultimaOperacao = this._ultimaOperacao.asReadonly();

  registrarOperacao(comando: string, passos: PassoKernel[] = []): void {
    this._ultimaOperacao.set({ comando, passos });
  }
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
      resumo: 'Busca o manifesto',
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
          { categoria: 'sistema de arquivos', resumo: 'Nada a baixar', chamada: 'nada a gravar', explicacao: 'Todas as camadas já estão no disco: a imagem está atualizada.' }
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
        resumo: `${reaproveitadas.length} ${reaproveitadas.length === 1 ? 'camada reaproveitada' : 'camadas reaproveitadas'}`,
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
        resumo: `Extrai ${novas.length} ${novas.length === 1 ? 'camada' : 'camadas'}`,
        chamada: 'mkdir + tar -x em overlay2/<camada>/diff',
        explicacao: `Baixa e descompacta ${novas.length} ${novas.length === 1 ? 'camada nova' : 'camadas novas'} (${tamanho(novas.reduce((t, c) => t + c.tamanhoMB, 0))}).`
      },
      {
        categoria: 'registro',
        resumo: `Registra ${repositorio}:${tag}`,
        chamada: 'write repositories.json',
        explicacao: `Registra ${repositorio}:${tag} (${remota.id}) na lista local de imagens.`
      }
    );
    this._ultimaOperacao.set({ comando: `docker pull ${ref}`, passos });
    this._imagens.push(remota);
    this.notificar();
    return linhas.map(saida);
  }

  build(arquivo: string, ref?: string): LinhaSaida[] {
    const df = DOCKERFILES.find(d => d.arquivo === arquivo);
    if (!df) {
      throw new ErroDocker(
        `failed to read dockerfile: open ${arquivo}: no such file or directory (disponíveis: ${DOCKERFILES.map(d => d.arquivo).join(', ')})`
      );
    }
    const { repositorio, tag } = ref ? separarRef(ref) : { repositorio: '<none>', tag: '<none>' };
    const total = df.instrucoes.length + 1;
    const linhas = [saida('Sending build context to Docker daemon  3.072kB'), saida(`Step 1/${total} : FROM ${df.base}`)];

    let base = this.buscarImagem(df.base);
    const baixouBase = !base;
    if (!base) {
      linhas.push(...this.pull(df.base));
      base = this.buscarImagem(df.base)!;
    }
    linhas.push(saida(` ---> ${base.id}`));

    const existentes = new Set(this._imagens.flatMap(i => i.camadas.map(c => c.digest)));
    const camadas = [...base.camadas];
    const novas: Camada[] = [];
    let emCache = 0;
    let anterior = base.id;
    df.instrucoes.forEach((instrucao, i) => {
      linhas.push(saida(`Step ${i + 2}/${total} : ${instrucao.texto}`));
      const digest = hashCurto(`${anterior}|${instrucao.texto}`);
      const geraCamada = instrucao.tamanhoMB > 0;
      if (this.cacheBuild.has(digest) && (!geraCamada || existentes.has(digest))) {
        emCache++;
        linhas.push(saida(' ---> Using cache'));
      } else {
        const temporario = hexAleatorio(12);
        linhas.push(saida(` ---> Running in ${temporario}`), saida(`Removing intermediate container ${temporario}`));
        this.cacheBuild.add(digest);
        if (geraCamada) novas.push({ digest, tamanhoMB: instrucao.tamanhoMB, instrucao: instrucao.texto });
      }
      if (geraCamada) camadas.push({ digest, tamanhoMB: instrucao.tamanhoMB, instrucao: instrucao.texto });
      linhas.push(saida(` ---> ${digest}`));
      anterior = digest;
    });

    const id = hashCurto(`imagem|${anterior}`);
    const novasPastas = Object.keys(df.diretorios ?? {}).map(d => d.split('/')[1]);
    const imagem: Imagem = {
      repositorio,
      tag,
      id,
      criadaEm: new Date().toISOString(),
      camadas,
      comando: df.comando ?? base.comando,
      processos: df.processos ?? base.processos,
      logs: df.logs ?? base.logs,
      diretorios: {
        ...base.diretorios,
        ...df.diretorios,
        '/': [...new Set([...(base.diretorios['/'] ?? []), ...novasPastas])].sort()
      }
    };
    const jaExiste = this._imagens.some(i => i.id === id && i.repositorio === repositorio && i.tag === tag);
    if (!jaExiste) {
      for (let i = this._imagens.length - 1; i >= 0; i--) {
        const outra = this._imagens[i];
        const mesmaTag = !!ref && outra.repositorio === repositorio && outra.tag === tag;
        const mesmaSemTag = outra.id === id && outra.repositorio === '<none>';
        if (mesmaTag || mesmaSemTag) this._imagens.splice(i, 1);
      }
      this._imagens.push(imagem);
    }
    linhas.push(saida(`Successfully built ${id}`));
    if (ref) linhas.push(saida(`Successfully tagged ${repositorio}:${tag}`));

    const passos: PassoKernel[] = [
      {
        categoria: 'contexto',
        resumo: 'Envia a pasta ao daemon',
        chamada: 'tar ./ → dockerd',
        explicacao: 'Empacota a pasta e envia ao daemon: só esses arquivos podem ser usados nos COPY.'
      },
      {
        categoria: 'imagem base',
        resumo: `Parte do ${df.base}`,
        chamada: `FROM ${df.base} (${base.id})`,
        explicacao: baixouBase
          ? `Baixou o ${df.base} e usa as ${base.camadas.length} camadas dele como ponto de partida.`
          : `Reaproveita as ${base.camadas.length} camadas do ${df.base} que já estavam no disco.`
      }
    ];
    if (emCache) {
      passos.push({
        categoria: 'cache',
        resumo: `${emCache} ${emCache === 1 ? 'passo' : 'passos'} em cache`,
        chamada: `${emCache}× Using cache`,
        explicacao:
          emCache === df.instrucoes.length
            ? 'Nada mudou desde o último build: todas as instruções reaproveitaram o resultado anterior.'
            : `${emCache} ${emCache === 1 ? 'instrução reaproveitou' : 'instruções reaproveitaram'} o resultado de um build anterior.`
      });
    }
    if (novas.length) {
      passos.push({
        categoria: 'camadas novas',
        resumo: `${novas.length} ${novas.length === 1 ? 'camada nova' : 'camadas novas'}`,
        chamada: 'contêiner temporário + commit em overlay2',
        explicacao: `Cada RUN/COPY roda num contêiner temporário e o que ele grava vira uma camada: ${novas.length} ${novas.length === 1 ? 'camada nova' : 'camadas novas'} (${tamanho(novas.reduce((t, c) => t + c.tamanhoMB, 0))}).`
      });
    }
    const metadados = df.instrucoes.filter(i => !i.tamanhoMB).map(i => i.texto.split(' ')[0]);
    if (metadados.length) {
      passos.push({
        categoria: 'metadados',
        resumo: 'Não gera camada',
        chamada: metadados.join(', '),
        explicacao: 'Só mudam a configuração da imagem: não geram camada nem ocupam disco.'
      });
    }
    passos.push({
      categoria: 'registro',
      resumo: ref ? `Tag ${repositorio}:${tag}` : 'Imagem sem tag',
      chamada: 'write repositories.json',
      explicacao: ref ? `Marca a imagem ${id} com a tag ${repositorio}:${tag}.` : `A imagem ${id} fica sem tag e aparece como <none>.`
    });
    const flagArquivo = arquivo === 'Dockerfile' ? '' : `-f ${arquivo} `;
    this._ultimaOperacao.set({ comando: `docker build ${flagArquivo}${ref ? `-t ${ref} ` : ''}.`, passos });
    this.registrarEvento('image', 'build', ref ? `${repositorio}:${tag}` : id);
    this.notificar();
    return linhas;
  }

  // Incompleto de propósito. Falta:
  //  - recusar quando algum contêiner usa a imagem (e aceitar -f para forçar)
  //  - apagar só as camadas que nenhuma outra imagem usa, com uma linha "Deleted: sha256:..." para cada
  //  - registrar os passos em _ultimaOperacao e o evento "image delete"
  removerImagem(ref: string): LinhaSaida[] {
    const imagem = this.buscarImagem(ref);
    if (!imagem) throw new ErroDocker(`No such image: ${ref}`);
    this._imagens.splice(this._imagens.indexOf(imagem), 1);
    this.notificar();
    return [saida(`Untagged: ${imagem.repositorio}:${imagem.tag}`), saida(`Deleted: sha256:${imagem.id}`)];
  }

  buscarContainer(ref: string): Container {
    const c = this._containers.find(x => x.nome === ref) ?? this._containers.find(x => x.id.startsWith(ref));
    if (!c) throw new ErroDocker(`No such container: ${ref}`);
    return c;
  }

  run(op: OpcoesRun, comando?: string): { container: Container; linhas: LinhaSaida[] } {
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
      estado: 'created',
      criadoEm: new Date(),
      codigoSaida: 0,
      processos: [],
      proximoPid: 1,
      portas: op.portas ?? [],
      logs: [],
      projeto: op.projeto,
      servico: op.servico
    };
    this._containers.push(container);
    this.registrarEvento('container', 'create', nome);
    this.notificar();
    linhas.push(...this.iniciar(container, comando));
    return { container, linhas };
  }

  iniciar(c: Container, comando?: string): LinhaSaida[] {
    if (c.estado === 'running') return [];
    for (const porta of c.portas) {
      const host = porta.split(':')[0];
      const ocupada = this._containers.some(
        o => o !== c && o.estado === 'running' && o.portas.some(p => p.split(':')[0] === host)
      );
      if (ocupada) {
        throw new ErroDocker(
          `driver failed programming external connectivity on endpoint ${c.nome}: Bind for 0.0.0.0:${host} failed: port is already allocated`
        );
      }
    }

    c.estado = 'running';
    c.iniciadoEm = new Date();
    c.finalizadoEm = undefined;
    c.codigoSaida = 0;
    c.ip = `172.17.0.${this.proximoIp++}`;
    c.proximoPid = 1;
    c.processos = c.imagem.processos.map(p => ({ ...p, pid: c.proximoPid++, pidHost: this.novoPidHost() }));
    c.logs.push(...(c.imagem.logs ?? []));
    this.registrarEvento('container', 'start', c.nome);

    const passos = this.passosInicio(c);
    const linhas: LinhaSaida[] = [];
    if (!c.processos.length) {
      this.finalizar(c, 0);
      linhas.push(
        info(`O ${c.imagem.comando} não tem o que fazer sem um terminal: terminou na hora e o contêiner saiu (Exited 0).`)
      );
    }
    if (comando) this._ultimaOperacao.set({ comando, passos });
    this.notificar();
    return linhas;
  }

  parar(c: Container, comando?: string): void {
    if (c.estado !== 'running') return;
    const passos = this.passosParada(c);
    this.finalizar(c, 0);
    this.registrarEvento('container', 'stop', c.nome);
    if (comando) this._ultimaOperacao.set({ comando, passos });
    this.notificar();
  }

  reiniciar(c: Container, comando: string): LinhaSaida[] {
    const passosParada = c.estado === 'running' ? this.passosParada(c) : [];
    this.parar(c);
    const linhas = this.iniciar(c);
    this.registrarEvento('container', 'restart', c.nome);
    this._ultimaOperacao.set({ comando, passos: [...passosParada, ...this.passosInicio(c)] });
    return linhas;
  }

  logs(c: Container): LinhaSaida[] {
    return c.logs.map(saida);
  }

  private passosInicio(c: Container): PassoKernel[] {
    const programa = c.imagem.comando.split(' ')[0];
    return [
      {
        categoria: 'isolamento',
        resumo: 'Cria namespaces',
        chamada: 'clone(CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS | CLONE_NEWUTS)',
        explicacao: 'O processo nasce em namespaces próprios: tem PID 1, hostname, rede e sistema de arquivos só dele.'
      },
      {
        categoria: 'recursos',
        resumo: 'Cria o cgroup',
        chamada: 'mkdir /sys/fs/cgroup/docker/<id>',
        explicacao: 'Agrupa os processos do contêiner para o kernel contabilizar e limitar CPU e memória.'
      },
      {
        categoria: 'rede',
        resumo: c.portas.length ? `Porta ${c.portas.map(p => p.split(':')[0]).join(', ')} aberta` : `IP ${c.ip ?? '-'}`,
        chamada: c.portas.length ? 'veth ↔ docker0 + iptables DNAT' : 'veth ↔ docker0',
        explicacao: c.portas.length
          ? `Liga o contêiner à bridge e redireciona ${c.portas.map(p => `${p.split(':')[0]} do host → ${p.split(':')[1]}`).join(', ')} do contêiner.`
          : 'Liga o contêiner à bridge docker0 com um IP interno; nenhuma porta é exposta para fora.'
      },
      {
        categoria: 'execução',
        resumo: c.processos.length ? `Roda ${programa.split('/').pop()}` : 'Termina na hora',
        chamada: `execve("${programa}")`,
        explicacao: c.processos.length
          ? 'O comando da imagem vira o PID 1 do contêiner. No host ele ganha outro PID.'
          : 'O comando terminou logo em seguida e o contêiner saiu com código 0.'
      }
    ];
  }

  private passosParada(c: Container): PassoKernel[] {
    const pid1 = c.processos.find(p => p.pid === 1);
    return [
      {
        categoria: 'sinal',
        resumo: 'Envia SIGTERM',
        chamada: `kill(${pid1?.pidHost ?? '?'}, SIGTERM)`,
        explicacao: 'Pede para o processo principal encerrar. Se não sair em 10s, o Docker manda SIGKILL.'
      },
      {
        categoria: 'limpeza',
        resumo: 'Desfaz processos e rede',
        chamada: 'rmdir cgroup + remove veth',
        explicacao: 'Os processos e a interface de rede somem, mas o contêiner continua existindo e pode ser iniciado de novo.'
      }
    ];
  }

  composeUp(projeto: ProjetoCompose, detach: boolean): LinhaSaida[] {
    const linhas: string[] = [];
    const preparados: string[] = [];
    const servicos = [...projeto.servicos].sort((a, b) => (a.dependeDe?.length ?? 0) - (b.dependeDe?.length ?? 0));
    const largura = Math.max(...servicos.map(sv => `Container ${projeto.nome}-${sv.nome}-1`.length), `Network ${projeto.nome}_default`.length);

    for (const servico of servicos) {
      if (servico.build) {
        const ref = `${projeto.nome}-${servico.nome}`;
        if (!this.buscarImagem(ref)) {
          this.build(servico.build, ref);
          linhas.push(` ✔ ${servico.nome.padEnd(largura)}  Built`);
          preparados.push(`${servico.nome} construída`);
        }
      } else if (servico.imagem && !this.buscarImagem(servico.imagem)) {
        this.pull(servico.imagem);
        linhas.push(` ✔ ${servico.nome.padEnd(largura)}  Pulled`);
        preparados.push(`${servico.nome} baixada`);
      }
    }

    const doProjeto = this._containers.filter(c => c.projeto === projeto.nome);
    const status: string[] = [];
    if (!doProjeto.length) status.push(` ✔ ${`Network ${projeto.nome}_default`.padEnd(largura)}  Created`);
    for (const servico of servicos) {
      const nome = `${projeto.nome}-${servico.nome}-1`;
      const existente = this._containers.find(c => c.nome === nome);
      let situacao = 'Running';
      if (!existente) {
        this.run({
          imagem: servico.build ? `${projeto.nome}-${servico.nome}` : servico.imagem!,
          nome,
          portas: servico.portas,
          projeto: projeto.nome,
          servico: servico.nome
        });
        situacao = 'Started';
      } else if (existente.estado !== 'running') {
        this.iniciar(existente);
        situacao = 'Started';
      }
      status.push(` ✔ ${`Container ${nome}`.padEnd(largura)}  ${situacao}`);
    }
    linhas.push(`[+] Running ${status.length}/${status.length}`, ...status);

    this._ultimaOperacao.set({
      comando: `docker compose up${detach ? ' -d' : ''}`,
      passos: [
        {
          categoria: 'arquivo',
          resumo: `${servicos.length} serviços`,
          chamada: 'lê docker-compose.yml',
          explicacao: `O arquivo descreve os serviços ${servicos.map(sv => sv.nome).join(' e ')}, suas imagens, portas e dependências.`
        },
        {
          categoria: 'rede',
          resumo: `Rede ${projeto.nome}_default`,
          chamada: 'docker network create',
          explicacao: 'O compose cria uma rede só do projeto: os serviços se encontram pelo nome (ex.: "cache").'
        },
        {
          categoria: 'imagens',
          resumo: preparados.length ? `${preparados.length} preparada${preparados.length === 1 ? '' : 's'}` : 'Já estavam prontas',
          chamada: 'docker build / docker pull',
          explicacao: preparados.length
            ? `Antes de subir: ${preparados.join(', ')}.`
            : 'Todas as imagens já existiam; nada foi baixado ou construído.'
        },
        {
          categoria: 'contêineres',
          resumo: `${servicos.length} no ar`,
          chamada: 'docker run (um por serviço)',
          explicacao: 'Cada serviço vira um contêiner, respeitando o depends_on: o cache sobe antes do web.'
        }
      ]
    });
    this.registrarEvento('container', 'compose up', projeto.nome);
    this.notificar();

    const saidaFinal = linhas.map(saida);
    if (!detach) saidaFinal.push(info('Sem -d o terminal ficaria mostrando os logs dos serviços; aqui ele é liberado.'));
    return saidaFinal;
  }

  composeDown(projeto: ProjetoCompose): LinhaSaida[] {
    const doProjeto = this._containers.filter(c => c.projeto === projeto.nome).reverse();
    if (!doProjeto.length) return [];
    const largura = Math.max(...doProjeto.map(c => `Container ${c.nome}`.length), `Network ${projeto.nome}_default`.length);
    const linhas = [`[+] Running ${doProjeto.length + 1}/${doProjeto.length + 1}`];
    for (const c of doProjeto) {
      this.parar(c);
      this._containers.splice(this._containers.indexOf(c), 1);
      this.registrarEvento('container', 'destroy', c.nome);
      linhas.push(` ✔ ${`Container ${c.nome}`.padEnd(largura)}  Removed`);
    }
    linhas.push(` ✔ ${`Network ${projeto.nome}_default`.padEnd(largura)}  Removed`);
    this._ultimaOperacao.set({
      comando: 'docker compose down',
      passos: [
        {
          categoria: 'parada',
          resumo: `${doProjeto.length} parados`,
          chamada: 'SIGTERM em cada serviço',
          explicacao: 'Para os serviços na ordem inversa da subida: primeiro o web, depois o cache.'
        },
        {
          categoria: 'remoção',
          resumo: 'Contêineres e rede apagados',
          chamada: 'docker rm + docker network rm',
          explicacao: 'Os contêineres e a rede do projeto são apagados. As imagens continuam no disco.'
        }
      ]
    });
    this.notificar();
    return linhas.map(saida);
  }

  containersDoProjeto(projeto: ProjetoCompose): Container[] {
    return this._containers.filter(c => c.projeto === projeto.nome);
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
      case 'ls': {
        const dir = args[0] ?? '/';
        const itens = c.imagem.diretorios[dir];
        if (!itens) throw new ErroDocker(`ls: cannot access '${dir}': No such file or directory`);
        return itens.length ? [saida(itens.join('  '))] : [];
      }
      default:
        throw new ErroDocker(`comando "${comando}" não é simulado. Disponíveis no exec: ps e ls`);
    }
  }
}
