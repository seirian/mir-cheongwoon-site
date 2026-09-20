-- Extend the schedule memo card with spreadsheet-sourced hover histories.
alter table public.schedule_memo
  add column if not exists waktaverse_history text not null default '',
  add column if not exists vr_mocap_history text not null default '',
  add column if not exists source_sheet text,
  add column if not exists synced_at timestamptz;

alter table public.schedule_memo
  drop constraint if exists schedule_memo_waktaverse_history_length,
  drop constraint if exists schedule_memo_vr_mocap_history_length;

alter table public.schedule_memo
  add constraint schedule_memo_waktaverse_history_length
    check (char_length(waktaverse_history) <= 12000),
  add constraint schedule_memo_vr_mocap_history_length
    check (char_length(vr_mocap_history) <= 12000);

update public.schedule_memo
set
  content = $memo$> 월요일, 화요일 정기 밴드 연습 및 휴뱅
(변경 가능)$memo$,
  waktaverse_history = $waktaverse$우왁굳을 잡아라

사이클대회

배그삼국지

나만 아니면 돼(등반게임)

구간단속 버터플라이

아르마 마라톤(첫번째 거 입니다!) (+시작전 진검승부 + 후열 배그)

마크 해상전투

✨밥버거 헤어샵 첫번째 손님!✨

아세토 고갯길 가요제 '디자이어' 보컬

배그 대잔치 여자 버튜버

구간단속2 더월드 준우승!(?)

세구님 오타쿠가왕

왁체대 왁린스만(왁굳님의 보석함!!!) 출신 역도 메달리스트

하렘배그 수셈이님의 사심픽!(?)

천양님의 잔치원

구간단속3 스포트라이트

천양 다이노스 2군 와이번스 CAM

버축대 잰디송 가이드

공주배그

비챤님 한글날 컨텐츠

왁타버스 배그티어 7티어

왁타버스 좀보이드 서버

배그대잔치

세구님의 버츄페 축하무대(청춘펀치)

세구님의 청백대전

왁징어게임2

최강 버튜버1

WBD 천양키즈 (1루수)

버육대 (레드라인 / 역도 금메달)

왁치동 실버버튼반 -> 브론즈반

왁조트 전속 가수

아이네님 LOL 아가컵 (QT1 팀장)

다 같이 종겜하기 (Cairn / 암벽등반게임)

릴동파2 (레드윙즈 / 코치)

진짜 똥강아지를 찾아라!

WBD SPECIAL MATCH
(천양키즈 vs 로얄버팔로즈 / 천양키즈 1루수)

세구님 어린이날 버츄얼 동요대회 [2등]

잘가 그렌라간 드릴 리틀콘

신작 스팀 멀티 게임 동아리 1기

쿰멤 가요제
DDrP - 낭만여행 (Feat. 미르)$waktaverse$,
  vr_mocap_history = $vr$우왁굳을 잡아라

사이클대회

왁체대 (왁린스만 / 역도 동메달)

비챤님 한글날 컨텐츠

최강 버튜버1

WBD (천양키즈 / 1루수)

버육대 (레드라인 / 역도 금메달)

최강 버튜버2

릴동파2 (레드윙즈 / 코치)

진짜 똥강아지를 찾아라!

WBD SPECIAL MATCH
(천양키즈 vs 로얄버팔로즈 / 천양키즈 1루수)

버추얼 예능 연수원 2화

세구님 어린이날 버츄얼 동요대회 [2등]

잘가 그렌라간 드릴 리틀콘$vr$,
  source_sheet = '2026.9',
  synced_at = now(),
  updated_at = now()
where id = 1;
