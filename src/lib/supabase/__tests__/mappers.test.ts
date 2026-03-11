// src/lib/supabase/__tests__/mappers.test.ts
// Tests for DB row → domain object mappers (pure functions, no DB needed)
// Validates snake_case→camelCase, null handling, legacy format compat
// RELEVANT FILES: src/lib/supabase/mappers.ts, src/lib/types/index.ts, src/lib/__tests__/factories.ts

import { mapPlayerRow, mapScoutingReportRow, mapCalendarEventRow, mapTrainingFeedbackRow, mapUserTaskRow } from '@/lib/supabase/mappers';
import { makePlayerRow, makeScoutingReportRow, makeCalendarEventRow, makeTrainingFeedbackRow, makeUserTaskRow } from '@/lib/__tests__/factories';

/* ───────────── mapPlayerRow ───────────── */

describe('mapPlayerRow', () => {
  it('maps all core fields from snake_case to camelCase', () => {
    const row = makePlayerRow({ name: 'Pedro Santos', club: 'Leixões SC' });
    const player = mapPlayerRow(row);

    expect(player.name).toBe('Pedro Santos');
    expect(player.club).toBe('Leixões SC');
    expect(player.positionNormalized).toBe('DC');
    expect(player.foot).toBe('Dir');
    expect(player.ageGroupId).toBe(10);
  });

  it('handles null/empty fields with sensible defaults', () => {
    const row = makePlayerRow({
      club: null,
      foot: null,
      contact: null,
      notes: null,
      recruitment_notes: null,
      referred_by: null,
    });
    const player = mapPlayerRow(row);

    expect(player.club).toBe('');
    expect(player.foot).toBe('');
    expect(player.contact).toBe('');
    expect(player.notes).toBe('');
    expect(player.recruitmentNotes).toBe('');
    expect(player.referredBy).toBe('');
  });

  it('filters null report labels and links', () => {
    const row = makePlayerRow({
      report_label_1: 'Relatório 1',
      report_label_2: null,
      report_label_3: 'Relatório 3',
      report_link_1: 'https://example.com/1',
      report_link_2: null,
      report_link_3: 'https://example.com/3',
    });
    const player = mapPlayerRow(row);

    expect(player.reportLabels).toEqual(['Relatório 1', 'Relatório 3']);
    expect(player.reportLinks).toEqual(['https://example.com/1', 'https://example.com/3']);
  });

  it('validates photo URLs — rejects relative paths and placeholders', () => {
    const row = makePlayerRow({
      photo_url: '/images/player.jpg',
      zz_photo_url: 'https://example.com/placeholder.png',
    });
    const player = mapPlayerRow(row);

    expect(player.photoUrl).toBeNull();
    expect(player.zzPhotoUrl).toBeNull();
  });

  it('accepts valid absolute photo URLs', () => {
    const url = 'https://cdn.example.com/photo.jpg';
    const row = makePlayerRow({ photo_url: url });
    const player = mapPlayerRow(row);

    expect(player.photoUrl).toBe(url);
  });

  it('formats shirt number — removes trailing .0', () => {
    expect(mapPlayerRow(makePlayerRow({ shirt_number: '4.0' })).shirtNumber).toBe('4');
    expect(mapPlayerRow(makePlayerRow({ shirt_number: '10.0' })).shirtNumber).toBe('10');
    // parseFloat('12A') = 12 — leading digits are parsed, so '12A' becomes '12'
    expect(mapPlayerRow(makePlayerRow({ shirt_number: '12A' })).shirtNumber).toBe('12');
    // Non-numeric strings are kept as-is
    expect(mapPlayerRow(makePlayerRow({ shirt_number: 'ABC' })).shirtNumber).toBe('ABC');
    expect(mapPlayerRow(makePlayerRow({ shirt_number: null })).shirtNumber).toBe('');
  });

  it('maps legacy English recruitment statuses to Portuguese', () => {
    expect(mapPlayerRow(makePlayerRow({ recruitment_status: 'pool' })).recruitmentStatus).toBeNull();
    expect(mapPlayerRow(makePlayerRow({ recruitment_status: 'shortlist' })).recruitmentStatus).toBe('por_tratar');
    expect(mapPlayerRow(makePlayerRow({ recruitment_status: 'in_contact' })).recruitmentStatus).toBe('em_contacto');
    expect(mapPlayerRow(makePlayerRow({ recruitment_status: 'negotiating' })).recruitmentStatus).toBe('a_decidir');
    expect(mapPlayerRow(makePlayerRow({ recruitment_status: 'confirmed' })).recruitmentStatus).toBe('confirmado');
    expect(mapPlayerRow(makePlayerRow({ recruitment_status: 'rejected' })).recruitmentStatus).toBe('rejeitado');
  });

  it('passes through modern Portuguese recruitment statuses', () => {
    expect(mapPlayerRow(makePlayerRow({ recruitment_status: 'vir_treinar' })).recruitmentStatus).toBe('vir_treinar');
    expect(mapPlayerRow(makePlayerRow({ recruitment_status: 'a_decidir' })).recruitmentStatus).toBe('a_decidir');
  });

  it('sets default values for computed fields', () => {
    const player = mapPlayerRow(makePlayerRow());
    expect(player.reportAvgRating).toBeNull();
    expect(player.reportRatingCount).toBe(0);
    expect(player.observationNotePreviews).toEqual([]);
  });
});

/* ───────────── department opinion parsing ───────────── */

describe('castToOpinionArray (via mapPlayerRow)', () => {
  it('handles null → empty array', () => {
    const player = mapPlayerRow(makePlayerRow({ department_opinion: null }));
    expect(player.departmentOpinion).toEqual([]);
  });

  it('handles valid array passthrough', () => {
    const player = mapPlayerRow(makePlayerRow({ department_opinion: ['1ª Escolha', 'Acompanhar'] }));
    expect(player.departmentOpinion).toEqual(['1ª Escolha', 'Acompanhar']);
  });

  it('handles JSON-encoded string in array item (bad migration artifact)', () => {
    const player = mapPlayerRow(makePlayerRow({ department_opinion: ['["1ª Escolha"]'] }));
    expect(player.departmentOpinion).toEqual(['1ª Escolha']);
  });

  it('handles single plain string → wrapped in array', () => {
    const player = mapPlayerRow(makePlayerRow({ department_opinion: 'Acompanhar' as unknown as string[] }));
    expect(player.departmentOpinion).toEqual(['Acompanhar']);
  });

  it('handles JSON array as string', () => {
    const player = mapPlayerRow(makePlayerRow({ department_opinion: '["Por Observar","Potencial"]' as unknown as string[] }));
    expect(player.departmentOpinion).toEqual(['Por Observar', 'Potencial']);
  });
});

/* ───────────── mapScoutingReportRow ───────────── */

describe('mapScoutingReportRow', () => {
  it('maps all fields from snake_case to camelCase', () => {
    const row = makeScoutingReportRow({ player_name_report: 'Gustavo Teixeira', rating: 5 });
    const report = mapScoutingReportRow(row);

    expect(report.playerNameReport).toBe('Gustavo Teixeira');
    expect(report.rating).toBe(5);
    expect(report.competition).toBe('Campeonato Distrital Sub-14');
    expect(report.extractionStatus).toBe('success');
  });

  it('handles null optional fields', () => {
    const row = makeScoutingReportRow({
      gdrive_link: null,
      strengths: null,
      weaknesses: null,
      rating: null,
    });
    const report = mapScoutingReportRow(row);

    expect(report.gdriveLink).toBe('');
    expect(report.strengths).toBe('');
    expect(report.weaknesses).toBe('');
    expect(report.rating).toBeNull();
  });
});

/* ───────────── mapCalendarEventRow ───────────── */

describe('mapCalendarEventRow', () => {
  it('maps event fields and joined player data', () => {
    const row = makeCalendarEventRow();
    const event = mapCalendarEventRow(row);

    expect(event.title).toBe('Treino de avaliação');
    expect(event.eventType).toBe('treino');
    expect(event.playerName).toBe('João Silva');
    expect(event.playerClub).toBe('Boavista FC');
    expect(event.playerPosition).toBe('DC');
  });

  it('handles null player join (event without linked player)', () => {
    const row = makeCalendarEventRow({ player_id: null, players: null });
    const event = mapCalendarEventRow(row);

    expect(event.playerId).toBeNull();
    expect(event.playerName).toBeNull();
    expect(event.playerClub).toBeNull();
  });

  it('resolves assignee name from free-text field', () => {
    const row = makeCalendarEventRow({ assignee_name: 'Carlos Lopes' });
    const event = mapCalendarEventRow(row);
    expect(event.assigneeName).toBe('Carlos Lopes');
  });

  it('handles null assignee', () => {
    const row = makeCalendarEventRow({ assignee_name: null });
    const event = mapCalendarEventRow(row);
    expect(event.assigneeName).toBe('');
  });
});

/* ───────────── mapTrainingFeedbackRow ───────────── */

describe('mapTrainingFeedbackRow', () => {
  it('maps all fields from snake_case to camelCase', () => {
    const row = makeTrainingFeedbackRow();
    const fb = mapTrainingFeedbackRow(row);

    expect(fb.id).toBe(1);
    expect(fb.clubId).toBe('club-abc');
    expect(fb.playerId).toBe(42);
    expect(fb.authorId).toBe('user-abc');
    expect(fb.trainingDate).toBe('2026-03-10');
    expect(fb.escalao).toBe('Sub-14');
    expect(fb.presence).toBe('attended');
    expect(fb.feedback).toBe('Bom posicionamento no treino.');
    expect(fb.rating).toBe(4);
  });

  it('resolves author name from joined profiles', () => {
    const fb = mapTrainingFeedbackRow(makeTrainingFeedbackRow({ profiles: { full_name: 'Ana Reis' } }));
    expect(fb.authorName).toBe('Ana Reis');
  });

  it('falls back to "Desconhecido" when profiles is null', () => {
    const fb = mapTrainingFeedbackRow(makeTrainingFeedbackRow({ profiles: null }));
    expect(fb.authorName).toBe('Desconhecido');
  });

  it('handles null optional fields', () => {
    const fb = mapTrainingFeedbackRow(makeTrainingFeedbackRow({
      escalao: null,
      feedback: null,
      rating: null,
    }));

    expect(fb.escalao).toBeNull();
    expect(fb.feedback).toBeNull();
    expect(fb.rating).toBeNull();
  });
});

/* ───────────── mapUserTaskRow ───────────── */

describe('mapUserTaskRow', () => {
  it('maps all core fields from snake_case to camelCase', () => {
    const row = makeUserTaskRow({ title: 'Agendar reunião com pais' });
    const task = mapUserTaskRow(row);

    expect(task.title).toBe('Agendar reunião com pais');
    expect(task.userId).toBe('user-abc');
    expect(task.clubId).toBe(1);
    expect(task.dueDate).toBe('2026-03-15');
    expect(task.completed).toBe(false);
    expect(task.source).toBe('manual');
    expect(task.pinned).toBe(false);
  });

  it('maps playerClub from joined players', () => {
    const task = mapUserTaskRow(makeUserTaskRow());
    expect(task.playerClub).toBe('Boavista FC');
  });

  it('maps playerMeetingDate from joined players', () => {
    const task = mapUserTaskRow(makeUserTaskRow());
    expect(task.playerMeetingDate).toBe('2026-03-20');
  });

  it('maps playerSigningDate from joined players', () => {
    const task = mapUserTaskRow(makeUserTaskRow());
    expect(task.playerSigningDate).toBe('2026-04-01');
  });

  it('maps playerMeetingAttendees as array', () => {
    const task = mapUserTaskRow(makeUserTaskRow());
    expect(task.playerMeetingAttendees).toEqual(['user-111', 'user-222']);
  });

  it('maps playerSigningAttendees as array', () => {
    const task = mapUserTaskRow(makeUserTaskRow());
    expect(task.playerSigningAttendees).toEqual(['user-333', 'user-444']);
  });

  it('handles null players join gracefully', () => {
    const row = makeUserTaskRow({ player_id: null, players: null });
    const task = mapUserTaskRow(row);

    expect(task.playerId).toBeNull();
    expect(task.playerName).toBeNull();
    expect(task.playerContact).toBeNull();
    expect(task.playerClub).toBeNull();
    expect(task.playerMeetingDate).toBeNull();
    expect(task.playerSigningDate).toBeNull();
    expect(task.playerMeetingAttendees).toEqual([]);
    expect(task.playerSigningAttendees).toEqual([]);
  });

  it('handles null attendees arrays from joined players', () => {
    const row = makeUserTaskRow({
      players: {
        name: 'Pedro Santos',
        contact: null,
        club: 'Leixões SC',
        meeting_date: null,
        signing_date: null,
        meeting_attendees: null,
        signing_attendees: null,
      },
    });
    const task = mapUserTaskRow(row);

    expect(task.playerMeetingAttendees).toEqual([]);
    expect(task.playerSigningAttendees).toEqual([]);
  });
});

/* ───────────── mapPlayerRow — signingAttendees ───────────── */

describe('mapPlayerRow — signingAttendees', () => {
  it('maps signingAttendees from array', () => {
    const row = makePlayerRow({ signing_attendees: ['Director Desportivo', 'Treinador'] });
    const player = mapPlayerRow(row);
    expect(player.signingAttendees).toEqual(['Director Desportivo', 'Treinador']);
  });

  it('returns empty array when signing_attendees is null', () => {
    const row = makePlayerRow({ signing_attendees: null });
    const player = mapPlayerRow(row);
    expect(player.signingAttendees).toEqual([]);
  });
});
