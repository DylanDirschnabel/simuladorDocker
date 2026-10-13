import { Component, computed, inject } from '@angular/core';
import { DockerEngineService } from '../../simulador/docker-engine.service';
import { Camada, Imagem } from '../../simulador/modelos';
import { tamanho } from '../../simulador/utils';

@Component({
  selector: 'app-painel-visualizacao',
  templateUrl: './painel-visualizacao.component.html',
  styleUrl: './painel-visualizacao.component.css'
})
export class PainelVisualizacaoComponent {
  private readonly engine = inject(DockerEngineService);

  readonly imagens = this.engine.imagens;
  readonly tamanho = tamanho;

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
