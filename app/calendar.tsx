import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Pressable, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, shadow, statusColor } from '../lib/theme';
import { supabase } from '../lib/supabase';

type Event = {
  id: string;
  name: string;
  type: 'maintenance' | 'calibration';
  date: string;
  status: string;
  daysAway: number;
};

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function CalendarScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('instruments')
      .select('id, name, status, next_maintenance, next_calibration');

    const list: Event[] = [];
    for (const inst of data || []) {
      if (inst.next_maintenance) {
        const d = new Date(inst.next_maintenance);
        list.push({
          id: inst.id + '_maint',
          name: inst.name,
          type: 'maintenance',
          date: inst.next_maintenance,
          status: inst.status,
          daysAway: Math.floor((d.getTime() - today.getTime()) / 86400000),
        });
      }
      if (inst.next_calibration) {
        const d = new Date(inst.next_calibration);
        list.push({
          id: inst.id + '_calib',
          name: inst.name,
          type: 'calibration',
          date: inst.next_calibration,
          status: inst.status,
          daysAway: Math.floor((d.getTime() - today.getTime()) / 86400000),
        });
      }
    }
    list.sort((a, b) => a.date.localeCompare(b.date));
    setEvents(list);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelectedDate(null);
  };

  const eventsByDate: Record<string, Event[]> = {};
  for (const e of events) {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = (day: number) => `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

  // Upcoming events — next 60 days
  const upcoming = events.filter(e => e.daysAway >= 0 && e.daysAway <= 60);
  const overdue = events.filter(e => e.daysAway < 0);

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Maintenance Calendar</Text>
      <Text style={styles.pageSubtitle}>All upcoming maintenance and calibration schedules</Text>

      {/* ── Summary strips ── */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { borderLeftColor: colors.danger }]}>
          <Text style={styles.summaryNum}>{overdue.length}</Text>
          <Text style={styles.summaryLabel}>Overdue</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftColor: colors.warning }]}>
          <Text style={styles.summaryNum}>{upcoming.filter(e => e.daysAway <= 7).length}</Text>
          <Text style={styles.summaryLabel}>This Week</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftColor: colors.primary }]}>
          <Text style={styles.summaryNum}>{upcoming.length}</Text>
          <Text style={styles.summaryLabel}>Next 60 Days</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <>
          {/* ── Calendar ── */}
          <View style={[styles.calCard, shadow]}>
            {/* Month nav */}
            <View style={styles.monthNav}>
              <Pressable onPress={prevMonth} style={styles.navBtn}>
                <Ionicons name="chevron-back" size={20} color={colors.primary} />
              </Pressable>
              <Text style={styles.monthTitle}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Text>
              <Pressable onPress={nextMonth} style={styles.navBtn}>
                <Ionicons name="chevron-forward" size={20} color={colors.primary} />
              </Pressable>
            </View>

            {/* Day headers */}
            <View style={styles.dayHeaders}>
              {DAY_NAMES.map(d => (
                <Text key={d} style={styles.dayHeader}>{d}</Text>
              ))}
            </View>

            {/* Grid */}
            <View style={styles.grid}>
              {cells.map((day, idx) => {
                if (!day) return <View key={`empty-${idx}`} style={styles.cell} />;
                const ds = dateStr(day);
                const isToday = ds === todayStr;
                const isSelected = ds === selectedDate;
                const dayEvents = eventsByDate[ds] || [];
                const hasOverdue = dayEvents.some(e => e.daysAway < 0);
                const hasMaint = dayEvents.some(e => e.type === 'maintenance');
                const hasCalib = dayEvents.some(e => e.type === 'calibration');

                return (
                  <Pressable
                    key={ds}
                    style={[
                      styles.cell,
                      isToday && styles.todayCell,
                      isSelected && styles.selectedCell,
                    ]}
                    onPress={() => setSelectedDate(isSelected ? null : ds)}
                  >
                    <Text style={[
                      styles.dayNum,
                      isToday && styles.todayNum,
                      isSelected && styles.selectedNum,
                    ]}>
                      {day}
                    </Text>
                    {/* Dot indicators */}
                    {dayEvents.length > 0 && (
                      <View style={styles.dots}>
                        {hasMaint && (
                          <View style={[styles.dot, { backgroundColor: hasOverdue ? colors.danger : colors.warning }]} />
                        )}
                        {hasCalib && (
                          <View style={[styles.dot, { backgroundColor: hasOverdue ? colors.danger : colors.primary }]} />
                        )}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Legend */}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: colors.warning }]} />
                <Text style={styles.legendText}>Maintenance</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <Text style={styles.legendText}>Calibration</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: colors.danger }]} />
                <Text style={styles.legendText}>Overdue</Text>
              </View>
            </View>
          </View>

          {/* ── Selected day events ── */}
          {selectedDate && (
            <View style={[styles.section, shadow]}>
              <Text style={styles.sectionTitle}>
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                })}
              </Text>
              {selectedEvents.length === 0 ? (
                <Text style={styles.emptyText}>No events on this day.</Text>
              ) : selectedEvents.map(e => (
                <EventRow key={e.id} event={e} onPress={() => router.push(`/instrument/${e.id.split('_')[0]}`)} />
              ))}
            </View>
          )}

          {/* ── Overdue ── */}
          {overdue.length > 0 && (
            <View style={[styles.section, shadow]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <Text style={[styles.sectionTitle, { color: colors.danger }]}>Overdue ({overdue.length})</Text>
              </View>
              {overdue.map(e => (
                <EventRow key={e.id} event={e} onPress={() => router.push(`/instrument/${e.id.split('_')[0]}`)} />
              ))}
            </View>
          )}

          {/* ── Upcoming 60 days ── */}
          <View style={[styles.section, shadow]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="time-outline" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Upcoming — Next 60 Days</Text>
            </View>
            {upcoming.length === 0 ? (
              <Text style={styles.emptyText}>No events in the next 60 days.</Text>
            ) : upcoming.map(e => (
              <EventRow key={e.id} event={e} onPress={() => router.push(`/instrument/${e.id.split('_')[0]}`)} />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function EventRow({ event, onPress }: { event: Event; onPress: () => void }) {
  const isOverdue = event.daysAway < 0;
  const typeColor = event.type === 'calibration' ? colors.primary : colors.warning;
  const dateColor = isOverdue ? colors.danger : event.daysAway <= 7 ? colors.warning : colors.success;

  return (
    <Pressable onPress={onPress} style={styles.eventRow}>
      <View style={[styles.eventIcon, { backgroundColor: typeColor + '15' }]}>
        <Ionicons
          name={event.type === 'calibration' ? 'speedometer-outline' : 'construct-outline'}
          size={16} color={typeColor}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.eventName} numberOfLines={1}>{event.name}</Text>
        <Text style={styles.eventType}>{event.type === 'calibration' ? 'Calibration' : 'Maintenance'}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.eventDate, { color: dateColor }]}>{event.date}</Text>
        <Text style={[styles.eventDays, { color: dateColor }]}>
          {isOverdue ? `${Math.abs(event.daysAway)}d overdue` : event.daysAway === 0 ? 'Today' : `in ${event.daysAway}d`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, maxWidth: 1280, alignSelf: 'center', width: '100%', paddingBottom: 40 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: colors.text },
  pageSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 20 },
  loading: { padding: 60, alignItems: 'center' },

  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  summaryCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4,
  },
  summaryNum: { fontSize: 24, fontWeight: '800', color: colors.text },
  summaryLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  calCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: 20,
  },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  navBtn: { padding: 8, borderRadius: 8, backgroundColor: colors.bg },
  monthTitle: { fontSize: 17, fontWeight: '800', color: colors.text },

  dayHeaders: { flexDirection: 'row', marginBottom: 4 },
  dayHeader: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.textMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 2,
  },
  todayCell: { backgroundColor: colors.primary + '15' },
  selectedCell: { backgroundColor: colors.primary },
  dayNum: { fontSize: 13, fontWeight: '500', color: colors.text },
  todayNum: { color: colors.primary, fontWeight: '800' },
  selectedNum: { color: '#fff', fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },

  legend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },

  section: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  emptyText: { color: colors.textMuted, fontSize: 13, padding: 8, textAlign: 'center' },

  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border,
  },
  eventIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  eventName: { fontSize: 14, fontWeight: '600', color: colors.text },
  eventType: { fontSize: 11, color: colors.textMuted, marginTop: 1, textTransform: 'capitalize' },
  eventDate: { fontSize: 13, fontWeight: '700' },
  eventDays: { fontSize: 11, fontWeight: '600', marginTop: 1 },
});
