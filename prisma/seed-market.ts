/**
 * 시세·호가·거래내역 화면을 확인할 테스트 거래를 만드는 SQL.
 *
 * 주문·체결을 서버와 같은 규칙(예약 포인트, 수수료 0.02% 버림, 매입원가 비례 차감)으로 쌓고,
 * 마지막에 체결로 차트 봉을 다시 계산한다. 한 문장(DO 블록)이라 seed와 운영 DB 수동 실행에 같이 쓴다.
 * - motumaker(매도 쪽)와 motutaker(매수 쪽)가 상장일부터 오늘까지 매일 거래해 시세 이력을 만든다.
 * - 두 계정이 현재가 위아래로 미체결 주문을 걸어 호가 5단계를 채운다.
 * - motuuser는 보유 종목, 부분 체결, 일부 체결 후 취소, 미체결 매수·매도 주문을 갖는다.
 *
 * motumaker 계정이 있으면 아무것도 하지 않는다. 미체결 주문은 서버가 시작할 때 호가창에 올라가므로
 * 서버가 떠 있는 상태에서 실행했다면 서버를 다시 시작해야 한다.
 */

/** seed의 거래 가능 상품. 상장일(며칠 전)은 seed와 같고, 그 다음 날부터 거래한다. */
const MARKET_STOCKS = [
  {
    code: 'MOTU0001',
    basePrice: 4_350,
    tick: 10,
    listedDaysAgo: 30,
    todayMove: 0.05,
  },
  {
    code: 'MOTU0002',
    basePrice: 8_200,
    tick: 100,
    listedDaysAgo: 20,
    todayMove: -0.03,
  },
  {
    code: 'MOTU0003',
    basePrice: 6_700,
    tick: 100,
    listedDaysAgo: 12,
    todayMove: 0.015,
  },
  {
    code: 'MOTU0004',
    basePrice: 3_100,
    tick: 10,
    listedDaysAgo: 9,
    todayMove: -0.06,
  },
  {
    code: 'MOTU0005',
    basePrice: 1_200,
    tick: 10,
    listedDaysAgo: 6,
    todayMove: 0.08,
  },
  // 오늘 체결이 없는 상품 (현재가 = 전일 종가, 등락률 0)
  {
    code: 'MOTU0006',
    basePrice: 12_000,
    tick: 100,
    listedDaysAgo: 4,
    todayMove: null,
  },
  {
    code: 'MOTU0007',
    basePrice: 5_500,
    tick: 100,
    listedDaysAgo: 2,
    todayMove: -0.01,
  },
] as const;

type StockCode = (typeof MARKET_STOCKS)[number]['code'];

const MAKER = 'motumaker';
const TAKER = 'motutaker';
const USER = 'motuuser';

/** 시각. 한국 날짜로 며칠 전의 몇 분째(0 = 00:00), 또는 지금부터 몇 분 전 */
type At = { d: number; m: number } | { ago: number };

type MarketEvent =
  | { op: 'holding'; u: string; s: StockCode; q: number }
  | ({
      op: 'order';
      k: string;
      u: string;
      s: StockCode;
      side: 'BUY' | 'SELL';
      p: number;
      q: number;
    } & At)
  | ({ op: 'fill'; b: string; sl: string; p: number; q: number } & At)
  | ({ op: 'cancel'; k: string } & At);

/** 정렬용. 지금부터 몇 분 전인지 대략 계산한다. */
const minutesAgoOf = (at: At): number =>
  'ago' in at ? at.ago : at.d * 1440 + (720 - at.m);

/** 같은 결과가 나오는 난수 */
function randomOf(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const roundToTick = (price: number, tick: number): number =>
  Math.max(tick * 2, Math.round(price / tick) * tick);

class EventBuilder {
  readonly events: { at: number; seq: number; event: MarketEvent }[] = [];
  private seq = 0;
  private orderSeq = 0;

  holding(u: string, s: StockCode, q: number): void {
    this.push(Number.MAX_SAFE_INTEGER, { op: 'holding', u, s, q });
  }

  order(
    u: string,
    s: StockCode,
    side: 'BUY' | 'SELL',
    p: number,
    q: number,
    at: At,
  ): string {
    const k = `o${++this.orderSeq}`;
    this.push(minutesAgoOf(at), { op: 'order', k, u, s, side, p, q, ...at });
    return k;
  }

  fill(b: string, sl: string, p: number, q: number, at: At): void {
    this.push(minutesAgoOf(at), { op: 'fill', b, sl, p, q, ...at });
  }

  cancel(k: string, at: At): void {
    this.push(minutesAgoOf(at), { op: 'cancel', k, ...at });
  }

  /** 상대 주문을 먼저 걸고 taker가 바로 체결한다. 상대 주문은 전부 체결된다. */
  trade(
    taker: string,
    s: StockCode,
    side: 'BUY' | 'SELL',
    p: number,
    q: number,
    at: At,
  ): string {
    const counterparty = side === 'BUY' ? MAKER : TAKER;
    const maker = this.order(
      counterparty,
      s,
      side === 'BUY' ? 'SELL' : 'BUY',
      p,
      q,
      at,
    );
    const order = this.order(taker, s, side, p, q, at);
    if (side === 'BUY') {
      this.fill(order, maker, p, q, at);
    } else {
      this.fill(maker, order, p, q, at);
    }
    return order;
  }

  /** 시간순(오래된 것부터), 같은 시각이면 만든 순서 */
  sorted(): MarketEvent[] {
    return [...this.events]
      .sort((a, b) => b.at - a.at || a.seq - b.seq)
      .map(({ event }) => event);
  }

  private push(at: number, event: MarketEvent): void {
    this.events.push({ at, seq: this.seq++, event });
  }
}

/** 오늘 체결 시각 (분 전) */
const TODAY_TRADES_AGO = [95, 70, 45, 25, 12, 4];

function buildEvents(): MarketEvent[] {
  const builder = new EventBuilder();
  /** 상품별 날짜별 종가. dailyClose[code][daysAgo] */
  const dailyClose = new Map<StockCode, Map<number, number>>();

  for (const [index, stock] of MARKET_STOCKS.entries()) {
    const random = randomOf(index + 1);
    const closes = new Map<number, number>();
    dailyClose.set(stock.code, closes);
    builder.holding(MAKER, stock.code, 100_000);

    let price: number = stock.basePrice;
    for (let d = stock.listedDaysAgo - 1; d >= 1; d--) {
      for (const m of [600, 870]) {
        price = roundToTick(price * (1 + (random() - 0.5) * 0.06), stock.tick);
        const qty = 10 + Math.floor(random() * 70);
        builder.trade(TAKER, stock.code, 'BUY', price, qty, { d, m });
      }
      closes.set(d, price);
    }

    if (stock.todayMove !== null) {
      const target = price * (1 + stock.todayMove);
      const start = price;
      for (const [i, ago] of TODAY_TRADES_AGO.entries()) {
        const ratio = (i + 1) / TODAY_TRADES_AGO.length;
        price = roundToTick(
          start + (target - start) * ratio + (random() - 0.5) * stock.tick * 4,
          stock.tick,
        );
        if (i === TODAY_TRADES_AGO.length - 1) {
          price = roundToTick(target, stock.tick);
        }
        const qty = 5 + Math.floor(random() * 40);
        builder.trade(TAKER, stock.code, 'BUY', price, qty, { ago });
      }
    }
    closes.set(0, price);
  }

  const closeOf = (code: StockCode, d: number) => dailyClose.get(code)!.get(d)!;
  const tickOf = (code: StockCode) =>
    MARKET_STOCKS.find((stock) => stock.code === code)!.tick;

  // motuuser 보유·거래내역
  builder.trade(USER, 'MOTU0001', 'BUY', closeOf('MOTU0001', 20), 12, {
    d: 20,
    m: 660,
  });
  builder.trade(USER, 'MOTU0002', 'BUY', closeOf('MOTU0002', 15), 6, {
    d: 15,
    m: 690,
  });
  builder.trade(USER, 'MOTU0004', 'BUY', closeOf('MOTU0004', 8), 25, {
    d: 8,
    m: 630,
  });
  {
    // 8주 주문 중 5주만 체결된 뒤 남은 수량 취소
    const p = closeOf('MOTU0003', 6);
    const maker = builder.order(MAKER, 'MOTU0003', 'SELL', p, 5, {
      d: 6,
      m: 700,
    });
    const order = builder.order(USER, 'MOTU0003', 'BUY', p, 8, {
      d: 6,
      m: 700,
    });
    builder.fill(order, maker, p, 5, { d: 6, m: 700 });
    builder.cancel(order, { d: 6, m: 730 });
  }
  builder.trade(USER, 'MOTU0005', 'BUY', closeOf('MOTU0005', 5), 30, {
    d: 5,
    m: 610,
  });
  builder.trade(USER, 'MOTU0004', 'BUY', closeOf('MOTU0004', 4), 10, {
    d: 4,
    m: 840,
  });
  {
    // 매도 주문 두 개와 나눠 체결
    const p = closeOf('MOTU0006', 3);
    const first = builder.order(MAKER, 'MOTU0006', 'SELL', p, 7, {
      d: 3,
      m: 650,
    });
    const second = builder.order(MAKER, 'MOTU0006', 'SELL', p, 8, {
      d: 3,
      m: 650,
    });
    const order = builder.order(USER, 'MOTU0006', 'BUY', p, 15, {
      d: 3,
      m: 651,
    });
    builder.fill(order, first, p, 7, { d: 3, m: 651 });
    builder.fill(order, second, p, 8, { d: 3, m: 651 });
  }
  builder.trade(USER, 'MOTU0005', 'SELL', closeOf('MOTU0005', 2), 12, {
    d: 2,
    m: 900,
  });
  builder.trade(USER, 'MOTU0001', 'SELL', closeOf('MOTU0001', 1), 4, {
    d: 1,
    m: 820,
  });
  builder.trade(USER, 'MOTU0007', 'BUY', closeOf('MOTU0007', 0), 10, {
    ago: 30,
  });
  {
    // 20주 중 8주만 체결된 미체결 매수 (일부 체결)
    const p = closeOf('MOTU0001', 0);
    const maker = builder.order(MAKER, 'MOTU0001', 'SELL', p, 8, { ago: 3 });
    const order = builder.order(USER, 'MOTU0001', 'BUY', p, 20, { ago: 3 });
    builder.fill(order, maker, p, 8, { ago: 3 });
  }
  // 미체결 매도, 미체결 매수 (접수)
  builder.order(
    USER,
    'MOTU0002',
    'SELL',
    closeOf('MOTU0002', 0) + tickOf('MOTU0002') * 3,
    3,
    { ago: 2 },
  );
  builder.order(
    USER,
    'MOTU0004',
    'BUY',
    closeOf('MOTU0004', 0) - tickOf('MOTU0004') * 2,
    20,
    { ago: 2 },
  );

  // 호가 5단계: 현재가 위로 매도 6단계, 아래로 매수 6단계
  for (const [index, stock] of MARKET_STOCKS.entries()) {
    const random = randomOf(100 + index);
    const last = closeOf(stock.code, 0);
    for (let level = 1; level <= 6; level++) {
      builder.order(
        MAKER,
        stock.code,
        'SELL',
        last + stock.tick * level,
        10 + Math.floor(random() * 90),
        { ago: 1 },
      );
      builder.order(
        TAKER,
        stock.code,
        'BUY',
        last - stock.tick * level,
        10 + Math.floor(random() * 90),
        { ago: 1 },
      );
    }
  }

  return builder.sorted();
}

/**
 * 테스트 거래를 만드는 DO 블록. passwordHash는 시장 조성 계정 두 개의 비밀번호 해시다.
 */
export function marketSeedSql(passwordHash: string): string {
  if (!/^[A-Za-z0-9$=+/,.-]+$/.test(passwordHash)) {
    throw new Error('비밀번호 해시 형식이 올바르지 않습니다.');
  }
  const events = JSON.stringify(buildEvents());
  const stockCodes = MARKET_STOCKS.map(({ code }) => `'${code}'`).join(', ');

  return `DO $motu$
DECLARE
  ev jsonb;
  order_ids jsonb := '{}';
  v_at timestamptz;
  v_user_id int;
  v_account_id int;
  v_stock_id int;
  v_stock_ids int[];
  v_order_id bigint;
  v_trade_id bigint;
  v_cash bigint;
  v_lock bigint;
  v_buy orders%ROWTYPE;
  v_sell orders%ROWTYPE;
  v_order orders%ROWTYPE;
  v_holding holdings%ROWTYPE;
  v_notional bigint;
  v_fee bigint;
  v_release bigint;
  v_cost_basis bigint;
  v_maker text;
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE login_id = '${MAKER}') THEN
    RAISE NOTICE '이미 테스트 거래가 있어 건너뜁니다.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE login_id = '${USER}') THEN
    RAISE EXCEPTION '${USER} 계정이 없습니다.';
  END IF;

  SELECT array_agg(stock_id) INTO v_stock_ids FROM stocks WHERE stock_code IN (${stockCodes});
  IF coalesce(array_length(v_stock_ids, 1), 0) <> ${MARKET_STOCKS.length} THEN
    RAISE EXCEPTION '테스트 상품(${MARKET_STOCKS[0].code}~${MARKET_STOCKS.at(-1)!.code})이 모두 있어야 합니다.';
  END IF;

  -- 시장 조성 계정 (매도 쪽, 매수 쪽)
  FOREACH v_maker IN ARRAY ARRAY['${MAKER}', '${TAKER}'] LOOP
    INSERT INTO users (login_id, password, email, nickname, birth_date, terms_agreed, privacy_agreed, marketing_agreed, modified_date)
    VALUES (v_maker, '${passwordHash}', v_maker || '@motu.test',
      CASE v_maker WHEN '${MAKER}' THEN '매도봇' ELSE '매수봇' END,
      DATE '2000-01-01', true, true, false, now())
    RETURNING user_id INTO v_user_id;
    INSERT INTO accounts (user_id, cash, modified_date)
    VALUES (v_user_id, 500000000, now())
    RETURNING account_id INTO v_account_id;
    INSERT INTO cash_ledgers (account_id, type, amount, balance_after, create_date)
    VALUES (v_account_id, 'ADJUST', 500000000, 500000000, now() - interval '60 days');
  END LOOP;

  FOR ev IN SELECT value FROM jsonb_array_elements($events$${events}$events$::jsonb) LOOP
    IF ev ? 'ago' THEN
      v_at := now() - make_interval(mins => (ev->>'ago')::int);
    ELSIF ev ? 'd' THEN
      v_at := (date_trunc('day', now() AT TIME ZONE 'Asia/Seoul')
        - make_interval(days => (ev->>'d')::int)
        + make_interval(mins => (ev->>'m')::int)) AT TIME ZONE 'Asia/Seoul';
    END IF;

    IF ev->>'op' IN ('holding', 'order') THEN
      SELECT a.account_id INTO v_account_id
      FROM accounts a JOIN users u ON u.user_id = a.user_id
      WHERE u.login_id = ev->>'u';
      SELECT stock_id INTO v_stock_id FROM stocks WHERE stock_code = ev->>'s';
    END IF;

    CASE ev->>'op'
    WHEN 'holding' THEN
      INSERT INTO holdings (account_id, stock_id, qty, total_amount, modified_date)
      SELECT v_account_id, v_stock_id, (ev->>'q')::bigint, (ev->>'q')::bigint * base_price, now()
      FROM stocks WHERE stock_id = v_stock_id;

    WHEN 'order' THEN
      v_lock := 0;
      IF ev->>'side' = 'BUY' THEN
        v_lock := (ev->>'p')::bigint * (ev->>'q')::bigint;
        v_lock := v_lock + v_lock * 2 / 10000;
        UPDATE accounts SET locked_cash = locked_cash + v_lock, version = version + 1, modified_date = now()
        WHERE account_id = v_account_id AND cash - locked_cash >= v_lock;
        IF NOT FOUND THEN
          RAISE EXCEPTION '% 계정의 사용 가능 포인트가 부족합니다. (필요 %P)', ev->>'u', v_lock;
        END IF;
      ELSE
        UPDATE holdings SET locked_qty = locked_qty + (ev->>'q')::bigint, modified_date = now()
        WHERE account_id = v_account_id AND stock_id = v_stock_id AND qty - locked_qty >= (ev->>'q')::bigint;
        IF NOT FOUND THEN
          RAISE EXCEPTION '% 계정의 % 매도 가능 수량이 부족합니다.', ev->>'u', ev->>'s';
        END IF;
      END IF;
      INSERT INTO orders (account_id, stock_id, client_order_id, side, price, qty, locked_amount, create_date, modified_date)
      VALUES (v_account_id, v_stock_id, gen_random_uuid(), (ev->>'side')::order_side,
        (ev->>'p')::bigint, (ev->>'q')::bigint, v_lock, v_at, v_at)
      RETURNING order_id INTO v_order_id;
      order_ids := order_ids || jsonb_build_object(ev->>'k', v_order_id);

    WHEN 'fill' THEN
      SELECT * INTO v_buy FROM orders WHERE order_id = (order_ids->>(ev->>'b'))::bigint;
      SELECT * INTO v_sell FROM orders WHERE order_id = (order_ids->>(ev->>'sl'))::bigint;
      SELECT * INTO v_holding FROM holdings WHERE account_id = v_sell.account_id AND stock_id = v_sell.stock_id;
      v_notional := (ev->>'p')::bigint * (ev->>'q')::bigint;
      v_fee := v_notional * 2 / 10000;
      -- 마지막 체결이면 남은 예약을 모두 푼다.
      IF v_buy.filled_qty + (ev->>'q')::bigint = v_buy.qty THEN
        v_release := v_buy.locked_amount;
      ELSE
        v_release := v_buy.price * (ev->>'q')::bigint;
        v_release := v_release + v_release * 2 / 10000;
      END IF;
      v_cost_basis := v_holding.total_amount * (ev->>'q')::bigint / v_holding.qty;

      INSERT INTO trades (stock_id, buy_order_id, sell_order_id, price, qty, create_date)
      VALUES (v_buy.stock_id, v_buy.order_id, v_sell.order_id, (ev->>'p')::bigint, (ev->>'q')::bigint, v_at)
      RETURNING trade_id INTO v_trade_id;

      UPDATE accounts SET cash = cash - (v_notional + v_fee), locked_cash = locked_cash - v_release,
        version = version + 1, modified_date = now()
      WHERE account_id = v_buy.account_id
      RETURNING cash INTO v_cash;
      INSERT INTO holdings (account_id, stock_id, qty, total_amount, modified_date)
      VALUES (v_buy.account_id, v_buy.stock_id, (ev->>'q')::bigint, v_notional + v_fee, now())
      ON CONFLICT (account_id, stock_id) DO UPDATE
      SET qty = holdings.qty + EXCLUDED.qty, total_amount = holdings.total_amount + EXCLUDED.total_amount,
        modified_date = now();
      INSERT INTO cash_ledgers (account_id, trade_id, type, amount, fee, balance_after, create_date)
      VALUES (v_buy.account_id, v_trade_id, 'BUY', -(v_notional + v_fee), v_fee, v_cash, v_at);

      UPDATE accounts SET cash = cash + (v_notional - v_fee), version = version + 1, modified_date = now()
      WHERE account_id = v_sell.account_id
      RETURNING cash INTO v_cash;
      IF v_holding.qty = (ev->>'q')::bigint THEN
        DELETE FROM holdings WHERE holding_id = v_holding.holding_id;
      ELSE
        UPDATE holdings SET qty = qty - (ev->>'q')::bigint, locked_qty = locked_qty - (ev->>'q')::bigint,
          total_amount = total_amount - v_cost_basis, modified_date = now()
        WHERE holding_id = v_holding.holding_id;
      END IF;
      INSERT INTO cash_ledgers (account_id, trade_id, type, amount, fee, realized_pnl, balance_after, create_date)
      VALUES (v_sell.account_id, v_trade_id, 'SELL', v_notional - v_fee, v_fee,
        v_notional - v_fee - v_cost_basis, v_cash, v_at);

      UPDATE orders SET filled_qty = filled_qty + (ev->>'q')::bigint, locked_amount = locked_amount - v_release,
        status = CASE WHEN filled_qty + (ev->>'q')::bigint = qty THEN 'FILLED' ELSE 'PARTIAL' END::order_status,
        modified_date = v_at
      WHERE order_id = v_buy.order_id;
      UPDATE orders SET filled_qty = filled_qty + (ev->>'q')::bigint,
        status = CASE WHEN filled_qty + (ev->>'q')::bigint = qty THEN 'FILLED' ELSE 'PARTIAL' END::order_status,
        modified_date = v_at
      WHERE order_id = v_sell.order_id;

    WHEN 'cancel' THEN
      SELECT * INTO v_order FROM orders WHERE order_id = (order_ids->>(ev->>'k'))::bigint;
      IF v_order.side = 'BUY' THEN
        UPDATE accounts SET locked_cash = locked_cash - v_order.locked_amount, version = version + 1, modified_date = now()
        WHERE account_id = v_order.account_id;
      ELSE
        UPDATE holdings SET locked_qty = locked_qty - (v_order.qty - v_order.filled_qty), modified_date = now()
        WHERE account_id = v_order.account_id AND stock_id = v_order.stock_id;
      END IF;
      UPDATE orders SET status = 'CANCELED', locked_amount = 0, canceled_date = v_at, modified_date = v_at
      WHERE order_id = v_order.order_id;
    END CASE;
  END LOOP;

  -- 차트 봉을 체결로 다시 계산한다. 일·주(월요일)·월 봉 경계는 한국 시간 00시다.
  DELETE FROM charts WHERE stock_id = ANY (v_stock_ids);
  INSERT INTO charts (stock_id, candle_interval, candle_time, open_price, high_price, low_price, close_price, volume, trade_amount)
  SELECT t.stock_id, i.unit::chart_interval, b.candle_time,
    (array_agg(t.price ORDER BY t.create_date, t.trade_id))[1],
    max(t.price), min(t.price),
    (array_agg(t.price ORDER BY t.create_date DESC, t.trade_id DESC))[1],
    sum(t.qty), sum(t.price * t.qty)
  FROM trades t
  CROSS JOIN (VALUES ('MINUTE'), ('HOUR'), ('DAY'), ('WEEK'), ('MONTH')) AS i(unit)
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN i.unit IN ('MINUTE', 'HOUR')
        THEN date_trunc(lower(i.unit), t.create_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      ELSE date_trunc(lower(i.unit), t.create_date AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
    END AS candle_time
  ) b
  WHERE t.stock_id = ANY (v_stock_ids)
  GROUP BY t.stock_id, i.unit, b.candle_time;
END
$motu$;`;
}
