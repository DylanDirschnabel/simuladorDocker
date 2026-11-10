import { Component, computed, inject, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { COMPOSE, textoCompose } from '../../simulador/compose';
import { DockerEngineService } from '../../simulador/docker-engine.service';
import { DOCKERFILES, comandoBuild, textoDockerfile } from '../../simulador/dockerfiles';
import { Camada, Imagem } from '../../simulador/modelos';
import { tamanho } from '../../simulador/utils';

interface ArquivoVisual {
  titulo: string;
  comando: string;
  linhas: { texto: string; tipo: string }[];
  conteudo: string;
}

@Component({
  selector: 'app-painel-visualizacao',
  imports: [DialogModule],
  templateUrl: './painel-visualizacao.component.html',
  styleUrl: './painel-visualizacao.component.css'
})
export class PainelVisualizacaoComponent {
  private readonly engine = inject(DockerEngineService);

  readonly imagens = this.engine.imagens;
  readonly tamanho = tamanho;

  readonly arquivos: ArquivoVisual[] = [
    {
      titulo: 'docker-compose.yml',
      comando: 'docker compose up -d',
      linhas: COMPOSE.servicos.map(s => ({
        texto: s.build ? `${s.nome}: build .${s.build === 'Dockerfile' ? '' : ` (${s.build})`}${s.portas?.length ? ` · ${s.portas.join(', ')}` : ''}` : `${s.nome}: image ${s.imagem}`,
        tipo: s.build ? 'build' : 'imagem'
      })),
      conteudo: textoCompose(COMPOSE).join('\n')
    },
    ...DOCKERFILES.map(d => ({
      titulo: d.arquivo,
      comando: comandoBuild(d),
      linhas: [
        { texto: `FROM ${d.base}`, tipo: 'base' },
        ...d.instrucoes.map(i => ({ texto: i.texto, tipo: i.tamanhoMB > 0 ? 'camada' : 'metadado' }))
      ],
      conteudo: textoDockerfile(d).join('\n')
    }))
  ];

  readonly aberto = signal<ArquivoVisual | null>(null);

  private readonly usoCamadas = computed(() => {
    const uso = new Map<string, number>();
    for (const c of this.imagens().flatMap(i => i.camadas)) uso.set(c.digest, (uso.get(c.digest) ?? 0) + 1);
    return uso;
  });

  usos(camada: Camada): number {
    return this.usoCamadas().get(camada.digest) ?? 0;
  }

  camadasDeCima(imagem: Imagem): Camada[] {
    return [...imagem.camadas].reverse();
  }

  tamanhoImagem(imagem: Imagem): string {
    return tamanho(imagem.camadas.reduce((t, c) => t + c.tamanhoMB, 0));
  }
}
