import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator
} from 'react-native';
import * as Speech from 'expo-speech';
import * as Notifications from 'expo-notifications';
import Svg, { Circle } from 'react-native-svg';

const SB_URL = 'https://fnxcuuyiggdcrouwxrza.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZueGN1dXlpZ2dkY3JvdXd4cnphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTY4NDMsImV4cCI6MjA5NTg5Mjg0M30.cYwJNI2zVS50W0ihx0f9fZdPAwU6SZdT1CpaEBzLU2Y';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const RING_SIZE = 160;
const RING_R = 65;
const RING_CIRC = 2 * Math.PI * RING_R;
const MAX_MINS = 120;

type Activity = {
  id: number;
  time: string;
  name: string;
  emoji: string;
  date: string;
};

function dateStr(d: Date) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function todayStr() { return dateStr(new Date()); }
function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return dateStr(d);
}

function toMins(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function curMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function fmtDiff(d: number, isTomorrow: boolean) {
  if (isTomorrow) {
    const h = Math.floor(d / 60), m = d % 60;
    return h > 0 ? (m > 0 ? `${h}t ${m}m` : `${h}t`) : `${m}m`;
  }
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

function speakActivity(a: Activity, diff: number, isDone: boolean, isNextDay: boolean, nextName?: string, nextTime?: string) {
  let msg = `${a.name}. `;
  if (isDone) {
    msg += 'Den har du redan gjort idag. Bra jobbat!';
  } else if (isNextDay) {
    msg += `Det är imorgon klockan ${a.time}. Du har ${fmtSpeech(diff)} kvar.`;
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

async function registerForNotifications() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    await Notifications.requestPermissionsAsync();
  }
}

async function scheduleNotifications(activities: Activity[]) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const now = new Date();
  const todayActs = activities.filter(a => a.date === todayStr());

  for (const act of todayActs) {
    const [h, m] = act.time.split(':').map(Number);
    const offsets = [60, 30, 10, 0];
    const messages = [
      `Om 1 timme: ${act.name} klockan ${act.time}`,
      `Om 30 minuter: ${act.name} — börja göra dig redo`,
      `Om 10 minuter: ${act.name} — snart dags!`,
      `DAGS NU: ${act.name} 🔔`,
    ];
    for (let i = 0; i < offsets.length; i++) {
      const trigger = new Date();
      trigger.setHours(h, m - offsets[i], 0, 0);
      if (trigger > now) {
        await Notifications.scheduleNotificationAsync({
          content: { title: 'Right on Time', body: messages[i], sound: true },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
        });
      }
    }
  }
}

export default function App() {
  const [acts, setActs] = useState<Activity[]>([]);
  const [now, setNow] = useState(curMins());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    registerForNotifications();
    loadSchedule();
    const tick = setInterval(() => setNow(curMins()), 30000);
    return () => clearInterval(tick);
  }, []);

  async function loadSchedule() {
    try {
      const today = todayStr();
      const tomorrow = tomorrowStr();
      const res = await fetch(
        `${SB_URL}/rest/v1/events?date=in.(${today},${tomorrow})&person=eq.olle&order=date.asc,time.asc`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      const rows = await res.json();
      const loaded: Activity[] = rows.map((r: any) => ({
        id: r.id, time: r.time || '00:00', name: r.name, emoji: r.emoji || '⭐', date: r.date
      }));
      setActs(loaded);
      setLoading(false);
      scheduleNotifications(loaded);
      setTimeout(() => speakNext(loaded), 1500);
    } catch (e) {
      setLoading(false);
    }
  }

  function speakNext(activities: Activity[]) {
    const today = todayStr();
    const tomorrow = tomorrowStr();
    const nowM = curMins();

    // Find next upcoming today
    const nextToday = activities.find(a => a.date === today && toMins(a.time) > nowM);
    if (nextToday) {
      const diff = toMins(nextToday.time) - nowM;
      const afterIdx = activities.indexOf(nextToday) + 1;
      const next2 = activities[afterIdx];
      speakActivity(nextToday, diff, false, false, next2?.name, next2?.time);
      return;
    }
    // All done today — speak tomorrow's first
    const nextTomorrow = activities.find(a => a.date === tomorrow);
    if (nextTomorrow) {
      const minsUntilMidnight = (24 * 60) - nowM;
      const diff = minsUntilMidnight + toMins(nextTomorrow.time);
      speakActivity(nextTomorrow, diff, false, true);
      return;
    }
    Speech.speak('Inget mer schema idag. Bra jobbat Olle!', { language: 'sv-SE', rate: 0.88 });
  }

  const today = todayStr();
  const tomorrow = tomorrowStr();
  const nowM = now;

  const todayActs = acts.filter(a => a.date === today);
  const tomorrowActs = acts.filter(a => a.date === tomorrow);

  const doneActs = todayActs.filter(a => toMins(a.time) <= nowM);
  const upcomingToday = todayActs.filter(a => toMins(a.time) > nowM);
  const nextAct = upcomingToday[0] || tomorrowActs[0] || null;
  const isNextTomorrow = nextAct ? nextAct.date === tomorrow : false;

  const minsUntilMidnight = (24 * 60) - nowM;
  const nextDiff = nextAct
    ? isNextTomorrow
      ? minsUntilMidnight + toMins(nextAct.time)
      : Math.max(0, toMins(nextAct.time) - nowM)
    : 0;

  const ringColor = isNextTomorrow ? '#378ADD' : nextDiff > 45 ? '#1D9E75' : nextDiff > 15 ? '#E8A020' : '#E24B4A';
  const ringFilled = RING_CIRC * Math.min(nextDiff / MAX_MINS, 1);
  const statusText = isNextTomorrow ? 'Imorgon bitti' : nextDiff > 45 ? 'Gott om tid ✓' : nextDiff > 15 ? 'Snart dags!' : 'Dags nu! 🔴';
  const statusBg = isNextTomorrow ? '#E6F1FB' : nextDiff > 45 ? '#E1F5EE' : nextDiff > 15 ? '#FEF3D7' : '#FDEEEE';
  const statusColor = isNextTomorrow ? '#185FA5' : nextDiff > 45 ? '#085041' : nextDiff > 15 ? '#7A4A00' : '#8B1A1A';

  const days = ['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag'];
  const months = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
  const todayDate = new Date();
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const dateLabel = `${days[todayDate.getDay()]} ${todayDate.getDate()} ${months[todayDate.getMonth()]}`;
  const tomorrowLabel = `${days[tomorrowDate.getDay()]} ${tomorrowDate.getDate()} ${months[tomorrowDate.getMonth()]}`;

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
          <Text style={styles.dayname}>{dateLabel}</Text>
        </View>
        <View style={styles.topbarButtons}>
          <TouchableOpacity style={styles.iconBtn} onPress={loadSchedule}>
            <Text style={styles.iconBtnText}>🔄</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => speakNext(acts)}>
            <Text style={styles.iconBtnText}>🔊</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Hero ring */}
      {nextAct ? (
        <TouchableOpacity style={styles.hero} activeOpacity={0.8} onPress={() => {
          const idx = acts.indexOf(nextAct);
          const next2 = acts[idx + 1];
          speakActivity(nextAct, nextDiff, false, isNextTomorrow, next2?.name, next2?.time);
        }}>
          <Text style={styles.nextLabel}>{isNextTomorrow ? `IMORGON KL ${nextAct.time}` : 'HÄRNÄST'}</Text>
          <View style={{ width: RING_SIZE, height: RING_SIZE }}>
            <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
              <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={RING_R} fill="none" stroke="#E8EDE9" strokeWidth={10}/>
              <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={RING_R} fill="none" stroke={ringColor} strokeWidth={10}
                strokeLinecap="round"
                strokeDasharray={`${ringFilled} ${RING_CIRC - ringFilled}`}
                transform={`rotate(-90 ${RING_SIZE/2} ${RING_SIZE/2})`}
              />
            </Svg>
            <View style={styles.ringCenter}>
              <Text style={styles.ringEmoji}>{nextAct.emoji}</Text>
              <Text style={[styles.ringNumber, { color: ringColor }]}>
                {nextDiff >= 60
                  ? `${Math.floor(nextDiff/60)}:${String(nextDiff%60).padStart(2,'0')}`
                  : String(nextDiff)}
              </Text>
              <Text style={styles.ringUnit}>{isNextTomorrow ? 'till imorgon' : nextDiff >= 60 ? 'timer' : 'minuter'}</Text>
            </View>
          </View>
          <Text style={styles.heroName}>{nextAct.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.hero}>
          <Text style={styles.heroName}>Bra jobbat idag, Olle! 🎉</Text>
        </View>
      )}

      {/* Activity list */}
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Done today */}
        {doneActs.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>GJORT IDAG</Text>
            {doneActs.map(a => (
              <TouchableOpacity key={a.id} style={[styles.card, styles.cardDone]}
                onPress={() => speakActivity(a, 0, true, false)}>
                <View style={styles.cardEmoji}><Text style={styles.cardEmojiText}>{a.emoji}</Text></View>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardTime}>kl {a.time}</Text>
                  <Text style={styles.cardName}>{a.name}</Text>
                </View>
                <View style={[styles.cardBadge, { backgroundColor: '#E1F5EE' }]}>
                  <Text style={[styles.cardBadgeText, { color: '#085041' }]}>✓ klar</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Upcoming today */}
        {upcomingToday.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>KOMMER IDAG</Text>
            {upcomingToday.map((a, i) => {
              const diff = toMins(a.time) - nowM;
              const isNext = i === 0;
              const next2 = upcomingToday[i + 1] || tomorrowActs[0];
              return (
                <TouchableOpacity key={a.id} style={[styles.card, isNext && styles.cardNext]}
                  onPress={() => speakActivity(a, Math.max(0, diff), false, false, next2?.name, next2?.time)}>
                  <View style={[styles.cardEmoji, isNext && styles.cardEmojiNext]}>
                    <Text style={styles.cardEmojiText}>{a.emoji}</Text>
                  </View>
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardTime}>kl {a.time}</Text>
                    <Text style={styles.cardName}>{a.name}</Text>
                  </View>
                  <View style={[styles.cardBadge, isNext && styles.cardBadgeNext]}>
                    <Text style={[styles.cardBadgeText, isNext && styles.cardBadgeTextNext]}>{fmtDiff(diff, false)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Tomorrow */}
        {tomorrowActs.length > 0 && (
          <>
            <View style={styles.dayDivider} />
            <Text style={styles.sectionLabel}>IMORGON · {tomorrowLabel.toUpperCase()}</Text>
            {tomorrowActs.map((a, i) => {
              const diff = minsUntilMidnight + toMins(a.time);
              const isNext = upcomingToday.length === 0 && i === 0;
              return (
                <TouchableOpacity key={a.id} style={[styles.card, isNext && styles.cardNextTomorrow]}
                  onPress={() => speakActivity(a, diff, false, true)}>
                  <View style={[styles.cardEmoji, isNext && styles.cardEmojiTomorrow]}>
                    <Text style={styles.cardEmojiText}>{a.emoji}</Text>
                  </View>
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardTime}>kl {a.time}</Text>
                    <Text style={styles.cardName}>{a.name}</Text>
                  </View>
                  <View style={[styles.cardBadge, { backgroundColor: '#E6F1FB' }]}>
                    <Text style={[styles.cardBadgeText, { color: '#185FA5' }]}>{fmtDiff(diff, true)}</Text>
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
  scroll: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#A0AFA3', marginBottom: 8, marginTop: 4, paddingHorizontal: 4 },
  dayDivider: { height: 1, backgroundColor: '#E8EDE9', marginVertical: 12, marginHorizontal: 4 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#E8EDE9', marginBottom: 8, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  cardDone: { opacity: 0.4 },
  cardNext: { borderColor: '#1D9E75', borderWidth: 2 },
  cardNextTomorrow: { borderColor: '#378ADD', borderWidth: 2, backgroundColor: '#F0F7FD' },
  cardEmoji: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#F5F7F5', borderWidth: 1.5, borderColor: '#E8EDE9', alignItems: 'center', justifyContent: 'center' },
  cardEmojiNext: { backgroundColor: '#E1F5EE', borderColor: '#9FE1CB' },
  cardEmojiTomorrow: { backgroundColor: '#E6F1FB', borderColor: '#B5D4F4' },
  cardEmojiText: { fontSize: 24 },
  cardMeta: { flex: 1 },
  cardTime: { fontSize: 11, fontWeight: '700', color: '#A0AFA3', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  cardName: { fontSize: 16, fontWeight: '800', color: '#1A2B1E' },
  cardBadge: { backgroundColor: '#F5F7F5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  cardBadgeNext: { backgroundColor: '#E1F5EE' },
  cardBadgeText: { fontSize: 12, fontWeight: '700', color: '#A0AFA3' },
  cardBadgeTextNext: { color: '#085041' },
  empty: { textAlign: 'center', color: '#A0AFA3', fontSize: 15, fontWeight: '600', marginTop: 40, lineHeight: 24 },
});