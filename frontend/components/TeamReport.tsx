import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import axios from 'axios';
import { API_URL } from '../utils/api';

// Vue du directeur : les soumissions de toute la concession, les véhicules
// convoités et le travail de chaque conseiller. Lecture seule.

type Row = {
  id: string; date: string; advisor: string; client_name: string; client_phone: string; client_email: string;
  vehicle: string; stock: string; price: number; sent_by: string; late: boolean;
};
type Report = {
  days: number; total: number;
  advisors: { advisor: string; submissions: number; clients: number; late: number }[];
  vehicles: { vehicle: string; stock: string; submissions: number; clients: number }[];
  submissions: Row[];
};

const PERIODS = [7, 30, 90];
const SENT = { fr: { sms: 'texto', print: 'imprimée', courriel: 'courriel' }, en: { sms: 'text', print: 'printed', courriel: 'email' } } as const;
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function TeamReport({ getToken, lang }: { getToken: () => Promise<string | null>; lang: 'fr' | 'en' }) {
  const fr = lang !== 'en';
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const tokenOf = useRef(getToken);
  tokenOf.current = getToken;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await tokenOf.current();
      const response = await axios.get(`${API_URL}/api/submissions/team`, {
        params: { days }, headers: { Authorization: `Bearer ${token}` },
      });
      setReport(response.data);
    } catch (e: any) {
      setReport(null);
      setError(e?.response?.status === 403
        ? (fr ? 'Cette vue est réservée au directeur.' : 'This view is for the manager only.')
        : (fr ? "Le rapport n'a pas pu être chargé. Réessayez." : 'The report could not be loaded. Try again.'));
    } finally {
      setLoading(false);
    }
  }, [days, fr]);

  useEffect(() => { load(); }, [load]);

  const day = (iso: string) => {
    const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short' });
  };

  return (
    <ScrollView style={s.wrap} testID="team-report">
      <View style={s.periods}>
        {PERIODS.map((p) => (
          <TouchableOpacity key={p} testID={`team-period-${p}`} onPress={() => setDays(p)} style={[s.period, days === p && s.periodOn]}>
            <Text style={[s.periodText, days === p && s.periodTextOn]}>{p} {fr ? 'jours' : 'days'}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={load} style={s.period}><Text style={s.periodText}>{fr ? 'Actualiser' : 'Refresh'}</Text></TouchableOpacity>
      </View>

      {loading && <ActivityIndicator color="#e6c65a" style={{ marginTop: 24 }} />}
      {!!error && <Text style={s.error}>{error}</Text>}

      {!loading && report && report.total === 0 && (
        <Text style={s.empty}>
          {fr ? `Aucune soumission dans les ${report.days} derniers jours. Elles apparaîtront ici dès qu'un conseiller en enverra une.`
            : `No submission in the last ${report.days} days. They will show here as soon as an advisor sends one.`}
        </Text>
      )}

      {!loading && report && report.total > 0 && (
        <>
          <Text style={s.summary}>
            {fr ? `${plural(report.total, 'soumission', 'soumissions')} en ${report.days} jours`
              : `${plural(report.total, 'submission', 'submissions')} in ${report.days} days`}
          </Text>

          <Text style={s.title}>{fr ? 'Véhicules convoités' : 'Most wanted vehicles'}</Text>
          {report.vehicles.slice(0, 15).map((v, i) => (
            <View key={`${v.stock}-${v.vehicle}-${i}`} style={s.card}>
              <Text style={s.main}>{v.vehicle}</Text>
              <Text style={s.sub}>
                {v.stock ? `${fr ? 'Inventaire' : 'Stock'} #${v.stock} · ` : ''}
                {fr ? `${plural(v.clients, 'client', 'clients')}, ${plural(v.submissions, 'soumission', 'soumissions')}`
                  : `${plural(v.clients, 'client', 'clients')}, ${plural(v.submissions, 'submission', 'submissions')}`}
              </Text>
            </View>
          ))}

          <Text style={s.title}>{fr ? 'Par conseiller' : 'By advisor'}</Text>
          {report.advisors.map((a) => (
            <View key={a.advisor} style={s.card}>
              <Text style={s.main}>{a.advisor}</Text>
              <Text style={s.sub}>
                {fr ? `${plural(a.submissions, 'soumission', 'soumissions')} · ${plural(a.clients, 'client', 'clients')}`
                  : `${plural(a.submissions, 'submission', 'submissions')} · ${plural(a.clients, 'client', 'clients')}`}
              </Text>
              {a.late > 0 && (
                <Text style={s.late}>{fr ? `${plural(a.late, 'suivi', 'suivis')} en retard` : `${plural(a.late, 'follow-up', 'follow-ups')} overdue`}</Text>
              )}
            </View>
          ))}

          <Text style={s.title}>{fr ? 'Soumissions' : 'Submissions'}</Text>
          {report.submissions.map((r) => (
            <View key={r.id} style={s.card}>
              <View style={s.line}>
                <Text style={s.main}>{r.client_name || (fr ? 'Client sans nom' : 'Unnamed client')}</Text>
                <Text style={s.sub}>{day(r.date)}</Text>
              </View>
              <Text style={s.vehicle}>{r.vehicle}{r.stock ? ` · #${r.stock}` : ''}</Text>
              <Text style={s.sub}>
                {[r.client_phone, r.client_email].filter(Boolean).join(' · ') || (fr ? 'Aucune coordonnée' : 'No contact details')}
              </Text>
              <Text style={s.sub}>
                {r.advisor} · {(SENT[fr ? 'fr' : 'en'] as Record<string, string>)[r.sent_by] || r.sent_by}
                {r.price ? ` · ${Math.round(r.price).toLocaleString('fr-CA')} $` : ''}
              </Text>
              {r.late && <Text style={s.late}>{fr ? 'Suivi en retard' : 'Follow-up overdue'}</Text>}
            </View>
          ))}
        </>
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 16, marginTop: 12 },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  period: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: '#303744' },
  periodOn: { backgroundColor: '#e6c65a', borderColor: '#e6c65a' },
  periodText: { color: '#9aa3b1', fontSize: 14, fontWeight: '600' },
  periodTextOn: { color: '#1b202a' },
  summary: { color: '#f4f1ea', fontSize: 20, fontWeight: '700', marginTop: 18 },
  title: { color: '#e6c65a', fontSize: 15, fontWeight: '700', marginTop: 22, marginBottom: 8 },
  card: { backgroundColor: '#1b202a', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#303744' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  main: { color: '#f4f1ea', fontSize: 15, fontWeight: '600', flexShrink: 1 },
  vehicle: { color: '#e6c65a', fontSize: 14, marginTop: 3 },
  sub: { color: '#9aa3b1', fontSize: 13, marginTop: 3 },
  late: { color: '#ff8a80', fontSize: 13, marginTop: 4, fontWeight: '600' },
  error: { color: '#ff8a80', fontSize: 14, marginTop: 20 },
  empty: { color: '#9aa3b1', fontSize: 15, marginTop: 28, lineHeight: 22 },
});
