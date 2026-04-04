import {
  Component, ElementRef, ViewChild, OnInit, OnDestroy, OnChanges,
  input, effect, inject, signal
} from '@angular/core';
import { createChart, IChartApi, ISeriesApi, CandlestickSeries, LineSeries, ColorType } from 'lightweight-charts';
import { Candle } from '../../core/models/types';

@Component({
  selector: 'app-chart',
  standalone: true,
  template: `
    <div class="chart-wrapper">
      <div #chartContainer class="chart-container"></div>
    </div>
  `,
  styles: [`
    .chart-wrapper {
      width: 100%;
      height: 100%;
      background: var(--bg-secondary);
      border-radius: 8px;
      overflow: hidden;
    }
    .chart-container {
      width: 100%;
      height: 100%;
    }
  `]
})
export class ChartComponent implements OnInit, OnDestroy {
  @ViewChild('chartContainer', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  candles = input<Candle[]>([]);
  latestCandle = input<Candle | null>(null);
  buyMarkers = input<{ time: number; price: number }[]>([]);
  sellMarkers = input<{ time: number; price: number }[]>([]);

  private chart!: IChartApi;
  private candleSeries!: ISeriesApi<'Candlestick'>;
  private resizeObserver!: ResizeObserver;

  ngOnInit(): void {
    this.initChart();

    effect(() => {
      const data = this.candles();
      if (data.length && this.candleSeries) {
        this.candleSeries.setData(data as any);
        this.chart.timeScale().fitContent();
      }
    });

    effect(() => {
      const c = this.latestCandle();
      if (c && this.candleSeries) {
        this.candleSeries.update(c as any);
      }
    });

    // Responsive resize
    this.resizeObserver = new ResizeObserver(() => {
      const el = this.containerRef.nativeElement;
      this.chart?.resize(el.clientWidth, el.clientHeight);
    });
    this.resizeObserver.observe(this.containerRef.nativeElement);
  }

  private initChart(): void {
    const el = this.containerRef.nativeElement;
    this.chart = createChart(el, {
      width: el.clientWidth || 800,
      height: el.clientHeight || 450,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#94a3b8',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#1e2744', style: 1 },
        horzLines: { color: '#1e2744', style: 1 },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: '#475569', width: 1, style: 2 },
        horzLine: { color: '#475569', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#2a2f45',
        textColor: '#94a3b8',
      },
      timeScale: {
        borderColor: '#2a2f45',
        timeVisible: true,
        secondsVisible: false,
        fixRightEdge: true,
      },
    });

    this.candleSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.remove();
  }
}
