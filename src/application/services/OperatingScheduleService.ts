import { ENV } from '../../infrastructure/config/env.js';
import type { ICacheService } from '../../infrastructure/cache/RedisService.js';

/** Decide si se debe procesar un mensaje sin invocar al agente. */
export class OperatingScheduleService {
  private readonly overrides = new Map<string, 'open' | 'closed'>();
  private readonly overrideTtlSeconds = 48 * 60 * 60;
  private globalPaused = false;

  public constructor(private readonly cacheService?: ICacheService) {}

  public isOpen(now = new Date()): boolean {
    return !this.globalPaused && this.isScheduleOpen(now);
  }

  public activateToday(now = new Date()): void { this.overrides.set(this.localParts(now).date, 'open'); }
  public deactivateToday(now = new Date()): void { this.overrides.set(this.localParts(now).date, 'closed'); }

  public async handleOperatorCommand(text: string, now = new Date()): Promise<boolean> {
    const command = text.trim().toLowerCase();
    const date = this.localParts(now).date;
    if (command === '!bot global off') {
      this.globalPaused = true;
      await this.cacheService?.set(this.globalPauseKey(), '1');
      return true;
    }
    if (command === '!bot global on') {
      this.globalPaused = false;
      await this.cacheService?.del(this.globalPauseKey());
      return true;
    }
    if (command === '!horario on' || command === '!horario abrir') {
      this.activateToday(now);
      await this.cacheService?.set(this.cacheKey(date), 'open', this.overrideTtlSeconds);
      return true;
    }
    if (command === '!horario off' || command === '!horario cerrar') {
      this.deactivateToday(now);
      await this.cacheService?.set(this.cacheKey(date), 'closed', this.overrideTtlSeconds);
      return true;
    }
    return false;
  }

  public getClosedMessage(): string { return ENV.BUSINESS_CLOSED_MESSAGE; }
  public getStatus(now = new Date()): { open: boolean; scheduleOpen: boolean; globallyPaused: boolean; date: string; timezone: string } {
    const local = this.localParts(now);
    const scheduleOpen = this.isScheduleOpen(now);
    return { open: scheduleOpen && !this.globalPaused, scheduleOpen, globallyPaused: this.globalPaused, date: local.date, timezone: ENV.BUSINESS_TIMEZONE };
  }

  public async isOpenAsync(now = new Date()): Promise<boolean> {
    await this.refresh(now);
    return this.isOpen(now);
  }

  public async getStatusAsync(now = new Date()): Promise<{ open: boolean; scheduleOpen: boolean; globallyPaused: boolean; date: string; timezone: string }> {
    await this.refresh(now);
    return this.getStatus(now);
  }

  private async refresh(now: Date): Promise<void> {
    const date = this.localParts(now).date;
    const override = await this.cacheService?.get(this.cacheKey(date));
    if (override === 'open' || override === 'closed') this.overrides.set(date, override);
    this.globalPaused = (await this.cacheService?.get(this.globalPauseKey())) === '1';
  }

  private cacheKey(date: string): string { return `admin:schedule:override:${date}`; }
  private globalPauseKey(): string { return 'admin:bot:global-paused'; }

  private isScheduleOpen(now: Date): boolean {
    const local = this.localParts(now);
    const override = this.overrides.get(local.date);
    if (override === 'open') return true;
    if (override === 'closed') return false;
    if (ENV.BUSINESS_CLOSED_WEEKDAYS.includes(local.weekday)) return false;
    return local.minutes >= ENV.BUSINESS_OPEN_MINUTE && local.minutes < ENV.BUSINESS_CLOSE_MINUTE;
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
