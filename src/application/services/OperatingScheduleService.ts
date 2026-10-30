import { ENV } from '../../infrastructure/config/env.js';

/** Decide si se debe procesar un mensaje sin invocar al agente. */
export class OperatingScheduleService {
  private readonly temporaryOpenDays = new Set<string>();

  public isOpen(now = new Date()): boolean {
    const local = this.localParts(now);
    const dayKey = local.date;
    if (this.temporaryOpenDays.has(dayKey)) return true;
    if (ENV.BUSINESS_CLOSED_WEEKDAYS.includes(local.weekday)) return false;
    return local.minutes >= ENV.BUSINESS_OPEN_MINUTE && local.minutes < ENV.BUSINESS_CLOSE_MINUTE;
  }

  public activateToday(now = new Date()): void { this.temporaryOpenDays.add(this.localParts(now).date); }
  public deactivateToday(now = new Date()): void { this.temporaryOpenDays.delete(this.localParts(now).date); }

  public handleOperatorCommand(text: string, now = new Date()): boolean {
    const command = text.trim().toLowerCase();
    if (command === '!horario on' || command === '!horario abrir') { this.activateToday(now); return true; }
    if (command === '!horario off' || command === '!horario cerrar') { this.deactivateToday(now); return true; }
    return false;
  }

  public getClosedMessage(): string { return ENV.BUSINESS_CLOSED_MESSAGE; }
  public getStatus(now = new Date()): { open: boolean; date: string; timezone: string } {
    const local = this.localParts(now);
    return { open: this.isOpen(now), date: local.date, timezone: ENV.BUSINESS_TIMEZONE };
  }

  private localParts(now: Date): { date: string; weekday: number; minutes: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: ENV.BUSINESS_TIMEZONE, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(now);
    const value = (type: string) => parts.find(part => part.type === type)?.value || '00';
    const weekdayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    return { date: `${value('year')}-${value('month')}-${value('day')}`, weekday: weekdayNames.indexOf(value('weekday').toLowerCase().slice(0, 3)), minutes: Number(value('hour')) * 60 + Number(value('minute')) };
  }
}
