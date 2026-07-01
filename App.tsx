import { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, Animated
} from 'react-native';
import * as Speech from 'expo-speech';
import Svg, { Circle } from 'react-native-svg';

const SB_URL = 'https://fnxcuuyiggdcrouwxrza.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZueGN1dXlpZ2dkY3JvdXd4cnphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTY4NDMsImV4cCI6MjA5NTg5Mjg0M30.cYwJNI2zVS50W0ihx0f9fZdPAwU6SZdT1CpaEBzLU2Y';

const RING_SIZE = 160;
const RING_R = 65;
const RING_CIRC = 2 * Math.PI * RING_R;
const MAX_MINS = 120;

type Activity = {
  id: number;
  time: string;
  name: string;
  emoji: string;
};

function todayStr() {
  const n = new Date();
  return n.getFullYear() + '-' +
    String(n.getMonth() + 1).padStart(2, '0') + '-' +
    String(n.getDate()).padStart(2, '0');
}

function toMins(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function curMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function fmtDiff(d: number) {
  if (d <= 0) return 'Nu';
  const h = Math.floor(d / 60), m = d % 60;
  return h > 0 ? (m > 0 ? `${h}t ${m}m` : `${h}t`) : `${m}m`;
}

function fmtSpeech(d: number) {
  if (d <= 0) return 'nu';
  const h = Math.floor(d / 60), m = d % 60;
  if (h > 0 && m > 0) return `${h} ${h === 1 ? 'timme' : 'timmar'} och ${m} minuter`;
  if (h > 0) return `${h} ${h === 1 ? 'timme' : 'timmar'}`;
  return `${m} minuter`;
}

function speakActivity(a: Activity, diff: number, isDone: boolean, nextName?: string, nextTime?: string) {
  let msg = `${a.name}. `;
  if (isDone) {
    msg += 'Den har du redan gjort idag. Bra jobbat!';
  } else {
    msg += `Det börjar klockan ${a.time}. `;
    if (diff <= 0) msg += 'Det är dags nu!';
    else if (diff <= 15) msg += `Det är om ${fmtSpeech(diff)}. Snart dags!`;
    else if (diff <= 45) msg += `Det är om ${fmtSpeech(diff)}. Börja snart göra dig redo.`;
    else msg += `Det är om ${fmtSpeech(diff)}. Du har gott om tid.`;
    if (nextName) msg += ` Efter det: ${nextName} klockan ${nextTime}.`;
  }
  Speech.speak(msg, { language: 'sv-SE', rate: 0.88 });
}

export default function App() {
  const [acts, setActs] = useState<Activity[]>([]);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [now, setNow] = useState(curMins());
  const [loading, setLoading] = useState(true);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const celebAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadSchedule();
    const tick = setInterval(() => setNow(curMins()), 30000);
    return () => clearInterval(tick);
  }, []);

  async function loadSchedule() {
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/events?date=eq.${todayStr()}&person=eq.olle&order=time.asc`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      const rows = await res.json();
      const loaded: Activity[] = rows.map((r: any) => ({
        id: r.id, time: r.time || '00:00', name: r.name, emoji: r.emoji || '⭐'
      }));
      setActs(loaded);
      const autoDone = new Set<number>();
      loaded.forEach((a, i) => { if (toMins(a.time) <= curMins()) autoDone.add(i); });
      setDone(autoDone);
      setLoading(false);
      setTimeout(() => {
        const ni = loaded.findIndex((_, i) => !autoDone.has(i));
        if (ni >= 0) {
          const a = loaded[ni];
          const diff = Math.max(0, toMins(a.time) - curMins());
          const next = loaded.find((_, i) => i > ni && !autoDone.has(i));
          speakActivity(a, diff, false, next?.name, next?.time);
        }
      }, 1500);
    } catch (e) {
      setLoading(false);
    }
  }

  const nextIdx = acts.findIndex((_, i) => !done.has(i));
  const nextAct = nextIdx >= 0 ? acts[nextIdx] : null;
  const nextDiff = nextAct ? Math.max(0, toMins(nextAct.time) - now) : 0;

  const ringColor = nextDiff > 45 ? '#1D9E75' : nextDiff > 15 ? '#E8A020' : '#E24B4A';
  const ringFilled = RING_CIRC * Math.min(nextDiff / MAX_MINS, 1);
  const statusText = nextDiff > 45 ? 'Gott om tid ✓' : nextDiff > 15 ? 'Snart dags!' : 'Dags nu! 🔴';
  const statusBg = nextDiff > 45 ? '#E1F5EE' : nextDiff > 15 ? '#FEF3D7' : '#FDEEEE';
  const statusColor = nextDiff > 45 ? '#085041' : nextDiff > 15 ? '#7A4A00' : '#8B1A1A';

  function handleDone() {
    if (nextIdx < 0) return;
    setConfirmIdx(nextIdx);
    Speech.speak(`Klar med ${acts[nextIdx].name}? Tryck ja om du är klar.`, { language: 'sv-SE', rate: 0.88 });
  }

  function confirmDone() {
    if (confirmIdx === null) return;
    const jd = acts[confirmIdx];
    const newDone = new Set(done);
    newDone.add(confirmIdx);
    setDone(newDone);
    setConfirmIdx(null);
    setCelebrating(true);
    Animated.sequence([
      Animated.spring(celebAnim, { toValue: 1, useNativeDriver: true }),
      Animated.delay(2800),
      Animated.spring(celebAnim, { toValue: 0, useNativeDriver: true }),
    ]).start(() => setCelebrating(false));
    const ni2 = acts.findIndex((_, i) => i > confirmIdx && !newDone.has(i));
    const na = ni2 >= 0 ? acts[ni2] : null;
    const diff2 = na ? Math.max(0, toMins(na.time) - curMins()) : 0;
    Speech.speak(
      `Bra jobbat Olle! ${jd.name} är klar. ${na ? `Nästa är ${na.name} om ${fmtSpeech(diff2)}.` : 'Du är klar för idag!'}`,
      { language: 'sv-SE', rate: 0.88 }
    );
  }

  const doneActs = acts.filter((_, i) => done.has(i));
  const upcomingActs = acts.filter((_, i) => !done.has(i));

  const days = ['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag'];
  const months = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
  const today = new Date();
  const dateStr = `${days[today.getDay()]} ${today.getDate()} ${months[today.getMonth()]}`;
  const [reloading, setReloading] = useState(false);

  async function reload() {
    setReloading(true);
    await loadSchedule();
    setReloading(false);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1D9E75" />
        <Text style={styles.loadingText}>Hämtar Olles dag...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Topbar */}
      <View style={styles.topbar}>
        <View>
          <Text style={styles.greeting}>Hej Olle! 👋</Text>
          <Text style={styles.dayname}>{dateStr}</Text>
        </View>
        <View style={styles.topbarButtons}>
          <TouchableOpacity style={styles.iconBtn} onPress={reload} disabled={reloading}>
            {reloading
              ? <ActivityIndicator size="small" color="#1D9E75" />
              : <Text style={styles.iconBtnText}>🔄</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => {
            if (nextAct) {
              const next2 = acts.find((_, i) => i > nextIdx && !done.has(i));
              speakActivity(nextAct, nextDiff, false, next2?.name, next2?.time);
            }
          }}>
            <Text style={styles.iconBtnText}>🔊</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Hero ring */}
      {nextAct && (
        <TouchableOpacity style={styles.hero} activeOpacity={0.8} onPress={() => {
          const next2 = acts.find((_, i) => i > nextIdx && !done.has(i));
          speakActivity(nextAct, nextDiff, false, next2?.name, next2?.time);
        }}>
          <Text style={styles.nextLabel}>HÄRNÄST</Text>
          <View style={{ width: RING_SIZE, height: RING_SIZE }}>
            <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
              <Circle
                cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                fill="none" stroke="#E8EDE9" strokeWidth={10}
              />
              <Circle
                cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                fill="none" stroke={ringColor} strokeWidth={10}
                strokeLinecap="round"
                strokeDasharray={`${ringFilled} ${RING_CIRC - ringFilled}`}
                transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              />
            </Svg>
            <View style={styles.ringCenter}>
              <Text style={styles.ringEmoji}>{nextAct.emoji}</Text>
              <Text style={[styles.ringNumber, { color: ringColor }]}>
                {nextDiff >= 60
                  ? `${Math.floor(nextDiff / 60)}:${String(nextDiff % 60).padStart(2, '0')}`
                  : String(nextDiff)}
              </Text>
              <Text style={styles.ringUnit}>{nextDiff >= 60 ? 'timer' : 'minuter'}</Text>
            </View>
          </View>
          <Text style={styles.heroName}>{nextAct.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Confirm / Celebrate / Done button */}
      {confirmIdx !== null ? (
        <View style={styles.actionArea}>
          <Text style={styles.confirmQ}>Klar med {acts[confirmIdx].name}?</Text>
          <View style={styles.confirmRow}>
            <TouchableOpacity style={styles.confirmYes} onPress={confirmDone}>
              <Text style={styles.confirmYesText}>✅ Ja, klar!</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmNo} onPress={() => {
              setConfirmIdx(null);
              Speech.speak('Okej, ingen fara!', { language: 'sv-SE' });
            }}>
              <Text style={styles.confirmNoText}>Inte än</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : celebrating ? (
        <Animated.View style={[styles.celebrateArea, {
          transform: [{ scale: celebAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
          opacity: celebAnim,
        }]}>
          <Text style={styles.celebrateEmoji}>🎉</Text>
          <Text style={styles.celebrateText}>Bra jobbat, Olle! 💪</Text>
        </Animated.View>
      ) : (
        <View style={styles.actionArea}>
          <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
            <Text style={styles.doneBtnText}>✅ Jag är klar!</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Activity list */}
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
        {doneActs.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>GJORT IDAG</Text>
            {doneActs.map((a) => (
              <TouchableOpacity key={a.id} style={[styles.card, styles.cardDone]}
                onPress={() => speakActivity(a, 0, true)}>
                <View style={styles.cardEmoji}><Text style={styles.cardEmojiText}>{a.emoji}</Text></View>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardTime}>kl {a.time}</Text>
                  <Text style={styles.cardName}>{a.name}</Text>
                </View>
                <View style={styles.cardBadge}><Text style={styles.cardBadgeText}>✓ klar</Text></View>
              </TouchableOpacity>
            ))}
            <View style={styles.divider} />
          </>
        )}
        {upcomingActs.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>KOMMER</Text>
            {upcomingActs.map((a) => {
              const realIdx = acts.indexOf(a);
              const diff = toMins(a.time) - now;
              const isNext = realIdx === nextIdx;
              const nextAfter = acts.find((_, i) => i > realIdx && !done.has(i));
              return (
                <TouchableOpacity key={a.id}
                  style={[styles.card, isNext && styles.cardNext]}
                  onPress={() => speakActivity(a, Math.max(0, diff), false, nextAfter?.name, nextAfter?.time)}>
                  <View style={[styles.cardEmoji, isNext && styles.cardEmojiNext]}>
                    <Text style={styles.cardEmojiText}>{a.emoji}</Text>
                  </View>
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardTime}>kl {a.time}</Text>
                    <Text style={styles.cardName}>{a.name}</Text>
                  </View>
                  <View style={[styles.cardBadge, isNext && styles.cardBadgeNext]}>
                    <Text style={[styles.cardBadgeText, isNext && styles.cardBadgeTextNext]}>{fmtDiff(diff)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
        {acts.length === 0 && (
          <Text style={styles.empty}>Inget schema idag.{'\n'}Fråga pappa! 👋</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7F5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7F5' },
  loadingText: { marginTop: 12, fontSize: 16, fontWeight: '600', color: '#6B7F70' },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  topbarButtons: { flexDirection: 'row', gap: 8 },
  greeting: { fontSize: 26, fontWeight: '800', color: '#1A2B1E' },
  dayname: { fontSize: 14, fontWeight: '600', color: '#6B7F70', marginTop: 2 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E8EDE9', alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 20 },
  hero: { alignItems: 'center', paddingVertical: 6 },
  nextLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#A0AFA3', marginBottom: 8 },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringEmoji: { fontSize: 32 },
  ringNumber: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  ringUnit: { fontSize: 11, fontWeight: '600', color: '#6B7F70' },
  heroName: { fontSize: 18, fontWeight: '800', color: '#1A2B1E', marginTop: 8 },
  statusBadge: { marginTop: 5, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '700' },
  actionArea: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  doneBtn: { backgroundColor: '#1D9E75', borderRadius: 20, padding: 16, alignItems: 'center', shadowColor: '#1D9E75', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  doneBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  confirmQ: { fontSize: 17, fontWeight: '700', color: '#1A2B1E', textAlign: 'center', marginBottom: 10 },
  confirmRow: { flexDirection: 'row', gap: 10 },
  confirmYes: { flex: 1, backgroundColor: '#1D9E75', borderRadius: 14, padding: 14, alignItems: 'center' },
  confirmYesText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  confirmNo: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#E8EDE9' },
  confirmNoText: { color: '#6B7F70', fontSize: 16, fontWeight: '700' },
  celebrateArea: { alignItems: 'center', paddingVertical: 8 },
  celebrateEmoji: { fontSize: 52 },
  celebrateText: { fontSize: 20, fontWeight: '800', color: '#085041', marginTop: 4 },
  scroll: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#A0AFA3', marginBottom: 8, marginTop: 4, paddingHorizontal: 4 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#E8EDE9', marginBottom: 8, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  cardDone: { opacity: 0.4 },
  cardNext: { borderColor: '#1D9E75', borderWidth: 2 },
  cardEmoji: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#F5F7F5', borderWidth: 1.5, borderColor: '#E8EDE9', alignItems: 'center', justifyContent: 'center' },
  cardEmojiNext: { backgroundColor: '#E1F5EE', borderColor: '#9FE1CB' },
  cardEmojiText: { fontSize: 24 },
  cardMeta: { flex: 1 },
  cardTime: { fontSize: 11, fontWeight: '700', color: '#A0AFA3', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  cardName: { fontSize: 16, fontWeight: '800', color: '#1A2B1E' },
  cardBadge: { backgroundColor: '#F5F7F5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  cardBadgeNext: { backgroundColor: '#E1F5EE' },
  cardBadgeText: { fontSize: 12, fontWeight: '700', color: '#A0AFA3' },
  cardBadgeTextNext: { color: '#085041' },
  divider: { height: 1, backgroundColor: '#E8EDE9', marginVertical: 8, marginHorizontal: 4 },
  empty: { textAlign: 'center', color: '#A0AFA3', fontSize: 15, fontWeight: '600', marginTop: 40, lineHeight: 24 },
});
