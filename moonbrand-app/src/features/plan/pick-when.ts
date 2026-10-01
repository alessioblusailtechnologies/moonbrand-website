import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import { isDay } from '../../lib/dates';

// Giorno e ora con i selettori del sistema, uno dopo l'altro. I valori sono dell'ora di Roma, come nel piano:
// i selettori mostrano i numeri così come sono, senza fusi.
function toLocal(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours || 0, minutes || 0);
}

const pad = (value: number) => String(value).padStart(2, '0');
const dayOf = (value: Date) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const timeOf = (value: Date) => `${pad(value.getHours())}:${pad(value.getMinutes())}`;

export function pickDate(date: string, minimum?: string): Promise<string | null> {
  return new Promise((resolve) =>
    DateTimePickerAndroid.open({
      value: toLocal(isDay(date) ? date : dayOf(new Date()), '12:00'),
      mode: 'date',
      minimumDate: minimum ? toLocal(minimum, '00:00') : undefined,
      onChange: (event, value) => resolve(event.type === 'set' && value ? dayOf(value) : null),
    }),
  );
}

export function pickTime(date: string, time: string): Promise<string | null> {
  return new Promise((resolve) =>
    DateTimePickerAndroid.open({
      value: toLocal(date, time),
      mode: 'time',
      is24Hour: true,
      onChange: (event, value) => resolve(event.type === 'set' && value ? timeOf(value) : null),
    }),
  );
}
