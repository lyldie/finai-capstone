import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

const GREEN = '#1C3C36';
const TEAL = '#3D7D6C';
const GOLD = '#EDB232';
const MUTED = '#7C9A95';
const EXPENSE = '#C96B65';
const EXPENSE_TINT = '#F3DEDA';

export type ChartPoint = { label: string; value: number };

type Props = {
  actual: ChartPoint[];
  forecast?: number | null;
  rangeLow?: number | null;
  rangeHigh?: number | null;
  limit?: number | null;
  forecastPeriods?: number;
  futureLabels?: string[];
  showLegend?: boolean;
  colorMode?: 'income' | 'expense' | 'neutral';
  accessibilityLabel: string;
  height?: number;
};

export default function ForecastTimelineChart({ actual, forecast, rangeLow, rangeHigh, limit, forecastPeriods = 1, futureLabels = [], showLegend = false, colorMode = 'neutral', accessibilityLabel, height = 190 }: Props) {
  const seriesColor = colorMode === 'expense' ? EXPENSE : TEAL;
  const forecastTint = colorMode === 'expense' ? EXPENSE_TINT : '#D8E8DF';
  const width = 330;
  const pad = { left: 12, right: 12, top: 14, bottom: 31 };
  const plotHeight = height - pad.top - pad.bottom;
  const plotWidth = width - pad.left - pad.right;
  const points = actual.slice(-6);
  const hasForecast = forecast != null && Number.isFinite(Number(forecast));
  const hasRange = rangeLow != null && rangeHigh != null && Number.isFinite(Number(rangeLow)) && Number.isFinite(Number(rangeHigh));
  const projectionCount = hasForecast ? Math.max(1, forecastPeriods) : 0;
  const columns = points.length + projectionCount;
  const allValues = [...points.map((p) => p.value), Number(forecast) || 0, Number(rangeHigh) || 0, Number(rangeLow) || 0, Number(limit) || 0];
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(1, ...allValues);
  const padding = Math.max((maxValue - minValue) * 0.12, 1);
  const min = minValue < 0 ? minValue - padding : 0;
  const max = maxValue + padding;
  const span = max - min;
  const y = (value: number) => pad.top + plotHeight - ((value - min) / span) * plotHeight;
  const slot = plotWidth / Math.max(columns, 1);
  const barWidth = Math.min(28, slot * 0.48);
  const x = (index: number) => pad.left + slot * index + (slot - barWidth) / 2;
  const center = (index: number) => x(index) + barWidth / 2;
  const lastIndex = points.length - 1;
  const forecastPath = hasForecast && lastIndex >= 0
    ? `M ${center(lastIndex)} ${y(points[lastIndex].value)} ${Array.from({ length: projectionCount }, (_, index) => `L ${center(points.length + index)} ${y(Number(forecast))}`).join(' ')}`
    : '';
  const formatTick = (v: number) => Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`;

  return <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {[0, 0.5, 1].map((ratio) => <React.Fragment key={ratio}>
        <Line x1={pad.left} x2={width - pad.right} y1={pad.top + plotHeight * ratio} y2={pad.top + plotHeight * ratio} stroke="#E7EEEA" strokeWidth={1} />
        <SvgText x={pad.left} y={pad.top + plotHeight * ratio - 3} fill={MUTED} fontSize={8}>{formatTick(max - span * ratio)}</SvgText>
      </React.Fragment>)}
      {Number.isFinite(Number(limit)) && Number(limit) > 0 && <>
        <Line x1={pad.left} x2={width - pad.right} y1={y(Number(limit))} y2={y(Number(limit))} stroke={GOLD} strokeWidth={1.5} strokeDasharray="5 4" />
        <SvgText x={width - pad.right - 2} y={Math.max(10, y(Number(limit)) - 4)} fill="#A66A0A" fontSize={8} textAnchor="end">Limit</SvgText>
      </>}
      {points.map((point, index) => <React.Fragment key={`${point.label}-${index}`}>
        <Rect x={x(index)} y={Math.min(y(point.value), y(0))} width={barWidth} height={Math.max(1, Math.abs(y(point.value) - y(0)))} rx={4} fill={seriesColor} />
        <SvgText x={center(index)} y={height - 10} fill={MUTED} fontSize={8} textAnchor="middle">{point.label.slice(0, 7)}</SvgText>
      </React.Fragment>)}
      {forecastPath && <Path d={forecastPath} fill="none" stroke={seriesColor} strokeWidth={1.5} strokeDasharray="4 4" />}
      {hasForecast && Array.from({ length: projectionCount }, (_, index) => {
        const pointIndex = points.length + index;
        const baseY = y(0);
        const forecastY = y(Number(forecast));
        const barY = Math.min(baseY, forecastY);
        const barHeight = Math.max(2, Math.abs(baseY - forecastY));
        const bandTop = hasRange ? y(Number(rangeHigh)) : 0;
        const bandBottom = hasRange ? y(Number(rangeLow)) : 0;
        const label = futureLabels[index] || `+${index + 1}`;
        return <React.Fragment key={`projection-${index}`}>
          {hasRange && <Rect x={center(pointIndex) - 8} y={bandTop} width={16} height={Math.max(2, bandBottom - bandTop)} rx={5} fill="#E7F1EB" />}
          <Rect x={x(pointIndex)} y={barY} width={barWidth} height={barHeight} rx={4} fill={forecastTint} stroke={seriesColor} strokeWidth={1.3} strokeDasharray="4 3" />
          <Circle cx={center(pointIndex)} cy={forecastY} r={3} fill={GOLD} stroke="#fff" strokeWidth={1} />
          <SvgText x={center(pointIndex)} y={height - 10} fill={GREEN} fontSize={8} fontWeight="bold" textAnchor="middle">{label.slice(0, 7)}</SvgText>
        </React.Fragment>;
      })}
    </Svg>
    {showLegend && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 4 }}>
      <Legend color={TEAL} label="Recorded" />
      {hasForecast && <Legend color={GOLD} label="SMA forecast" />}
      {Number.isFinite(Number(limit)) && Number(limit) > 0 && <Legend color={GOLD} label="Budget limit (dashed)" dashed />}
      {hasRange && <Legend color="#B7D8C8" label="Forecast range" />}
    </View>}
  </View>;
}

function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 15, height: dashed ? 0 : 8, borderTopWidth: 2, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid', backgroundColor: dashed ? 'transparent' : color, borderRadius: 3 }} /><Text style={{ color: MUTED, fontSize: 10 }}>{label}</Text></View>;
}
