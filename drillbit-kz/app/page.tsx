const products = [
  { code: "R32", size: "45 мм", price: "$40", margin: "62%", role: "Старт", note: "Массовый формат для подземных рудников" },
  { code: "T38", size: "76 мм", price: "$80", margin: "59%", role: "Старт", note: "Главный объём и сильная юнит-экономика" },
  { code: "DHD350", size: "140 мм", price: "$240", margin: "52%", role: "Этап 2", note: "Дорогой сегмент после отладки технологии" },
  { code: "CIR", size: "110 мм", price: "$62", margin: "29%", role: "Под заказ", note: "Китайский товар уже близок по цене" },
];

const steps = [
  ["01", "Заготовка", "Легированная сталь: пруток или поковка"],
  ["02", "Механообработка", "Токарка, резьба, шлицы и продувочные каналы"],
  ["03", "Гнёзда", "Точный натяг под твердосплавные штыри"],
  ["04", "Термообработка", "Цементация или закалка с отпуском"],
  ["05", "Сборка", "Запрессовка WC–Co, контроль, маркировка"],
];

const roadmap = [
  ["Импорт", "Выгрузить код 8207.13 за 2023–2025 годы и пересчитать рынок в штуках."],
  ["Реестр", "Проверить производителей и точное сопоставление характеристик товара."],
  ["Tizilim", "Собрать закупки 2024–2026: типоразмеры, объёмы, цены и покупатели."],
  ["Технология", "Получить 2–3 предложения на оборудование, лицензию и запуск с технологом."],
  ["ДВЦ", "Письменно подтвердить методику для изделия с импортными штырями и сталью."],
  ["Офтейк", "Проверить спрос Qarmet / Каражал и собрать 5-летнюю финансовую модель."],
];

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Drillbit Kazakhstan"><span className="brand-mark"><i /><i /><i /><i /></span><span><strong>DRILLBIT.KZ</strong><small>инвестиционный анализ</small></span></a>
        <nav aria-label="Навигация по исследованию"><a href="#market">Рынок</a><a href="#product">Продукт</a><a href="#economics">Экономика</a><a href="#risks">Риски</a></nav>
        <a className="nav-cta" href="#next">Следующие шаги <span>↘</span></a>
      </header>

      <section className="hero" id="top">
        <div className="hero-grid" />
        <div className="hero-copy">
          <div className="kicker"><span>Исследование · 16 ноября 2026</span><b>Казахстан</b></div>
          <h1>Производство<br /><em>штыревых</em><br />буровых коронок</h1>
          <p className="hero-lead">Импортозамещающее производство для рудников: рынок, продуктовая стратегия, юнит-экономика и условия входа.</p>
          <div className="hero-actions"><a className="primary" href="#decision">К решению</a><a className="secondary" href="#market">Смотреть расчёт <span>↓</span></a></div>
        </div>
        <div className="bit-visual" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="bit"><div className="bit-face"><i /><i /><i /><i /><i /><i /><span /></div><div className="bit-body"><b /><b /><b /><b /></div></div><span className="spec spec-a">T38 / 76</span><span className="spec spec-b">WC–Co</span><span className="spec spec-c">59% margin</span></div>
        <div className="hero-stats"><article><span>Рынок / год</span><strong>$3,5–6,5 млн</strong><small>45–80 тыс. коронок</small></article><article><span>Стартовый капитал</span><strong>$0,3–0,5 млн</strong><small>с оборотным капиталом</small></article><article><span>Окупаемость</span><strong>4–5 лет</strong><small>EBITDA + со 2-го года</small></article></div>
      </section>

      <section className="decision section" id="decision">
        <div className="section-index">00 / РЕШЕНИЕ</div>
        <div className="decision-main"><div className="signal"><span>Предварительный вердикт</span><b>ПРОВЕРЯТЬ ДАЛЬШЕ</b></div><h2>Ниша выглядит рабочей.<br />Но право на вход ещё нужно доказать.</h2><p>Рынок целиком импортный, локальная логистика даёт преимущество, а реестр может обеспечить доступ к закупкам недропользователей. Критический вопрос — производит ли «Жигермунайсервис» ударные штыревые коронки и как Tizilim сопоставляет товары.</p></div>
        <aside className="gate-card"><span className="gate-label">Инвестиционный шлюз</span><h3>Не покупать оборудование до трёх подтверждений</h3><ol><li><b>01</b><span>Свежий импорт и рынок в штуках</span></li><li><b>02</b><span>Закупки и типоразмеры в Tizilim</span></li><li><b>03</b><span>Реестр и отсутствие прямого конкурента</span></li></ol></aside>
      </section>

      <section className="market section dark" id="market">
        <div className="section-index">01 / РЫНОК</div>
        <div className="section-head"><div><p className="eyebrow">Спрос в Казахстане</p><h2>Небольшой рынок.<br />Полностью импортный.</h2></div><p>Импорт твердосплавного бурового инструмента по коду 8207.13 составил $7,14 млн в 2022 году. Для самих штыревых коронок рабочая оценка — $3,5–6,5 млн.</p></div>
        <div className="market-layout"><div className="market-chart"><div className="scale"><span>$0</span><span>$7,14 млн</span></div><div className="import-bar"><span style={{width:"33%"}}>Швеция · 2,34</span><span style={{width:"18%"}}>Таиланд · 1,31</span><span style={{width:"16%"}}>Россия · 1,16</span><span style={{width:"12%"}}>Китай +</span><span className="rest" /></div><div className="range"><i /><span><b>$3,5–6,5 млн</b> оценка целевого рынка</span></div></div><div className="market-notes"><article><b>15–20%</b><span>реалистичная доля к третьему году</span></article><article><b>7–12 тыс.</b><span>коронок локального производства</span></article><article><b>$0,6–1 млн</b><span>потенциальная выручка</span></article></div></div>
        <div className="tiers"><article><span>WEST / 01</span><h3>Западные бренды</h3><strong>≈ $180</strong><p>Epiroc T38 на казахстанском складе. Высокая стойкость и цена метра.</p></article><article className="accent"><span>LOCAL / 02</span><h3>Наша позиция</h3><strong>≈ $80</strong><p>Цена ближе к китайской, склад 1–3 дня, контроль качества и переточка.</p></article><article><span>CHINA / 03</span><h3>Китайские фабрики</h3><strong>$48–51</strong><p>T38-76 FOB: ценовой потолок, но не локальный склад и сервис.</p></article></div>
      </section>

      <section className="section product" id="product">
        <div className="section-index">02 / ПРОДУКТ</div>
        <div className="section-head"><div><p className="eyebrow">Портфель запуска</p><h2>Начать с резьбы.<br />Сложное — вторым этапом.</h2></div><p>Главная маржа и объём — в R32 и T38 для подземных рудников. DTH высокого давления добавляется после стабилизации термообработки. CIR — только под заказ.</p></div>
        <div className="product-grid">{products.map((p, i) => <article key={p.code} className={i < 2 ? "recommended" : ""}><div><span className="product-no">0{i+1}</span><span className="role">{p.role}</span></div><h3>{p.code}<small>{p.size}</small></h3><p>{p.note}</p><dl><div><dt>Цена</dt><dd>{p.price}</dd></div><div><dt>Маржа</dt><dd>{p.margin}</dd></div></dl></article>)}</div>
        <div className="process"><div className="process-title"><span>Производственный контур</span><strong>3 точки ноу-хау</strong><p>Натяг гнезда · режим термообработки · качество резьбы</p></div><div className="process-steps">{steps.map(s => <article key={s[0]}><span>{s[0]}</span><h4>{s[1]}</h4><p>{s[2]}</p></article>)}</div></div>
      </section>

      <section className="section economics" id="economics">
        <div className="section-index">03 / ЭКОНОМИКА</div>
        <div className="section-head"><div><p className="eyebrow">Базовый сценарий</p><h2>Безубыточность —<br />6,5 тыс. коронок.</h2></div><p>Средняя цена портфеля — $74, средний маржинальный доход — $41. Первый год убыточный: испытания и первые партии нужно покрыть оборотным капиталом.</p></div>
        <div className="economics-grid"><div className="scenario-card"><div className="scenario-head"><span>EBITDA / $ тыс.</span><b>3-летний план</b></div><div className="chart-area"><div className="zero-line"><span>0</span></div><div className="bar negative" style={{height:"73%"}}><b>−123</b><span>Год 1<small>2,5 тыс. шт.</small></span></div><div className="bar positive" style={{height:"12%"}}><b>+20</b><span>Год 2<small>6 тыс. шт.</small></span></div><div className="bar positive strong" style={{height:"100%"}}><b>+169</b><span>Год 3<small>10 тыс. шт.</small></span></div></div></div><div className="numbers-card"><article><span>Выручка / год 3</span><strong>$742k</strong><i>+67% г/г</i></article><article><span>Постоянные затраты</span><strong>$225k</strong><i>в год</i></article><article><span>Оборудование</span><strong>$150–320k</strong><i>старт → полный комплект</i></article><article><span>Мощность</span><strong>10–18k</strong><i>коронок в год</i></article></div></div>
        <div className="capex"><div><span>CAPEX-контур</span><h3>$0,3–0,5 млн</h3><p>Полный вход с оборотным капиталом и технологическим запуском.</p></div><ul><li><b>150–320</b><span>оборудование</span></li><li><b>100–120</b><span>сырьё и склад</span></li><li><b>20–50</b><span>запуск и консалтинг</span></li></ul><aside><b>Темиртау</b><p>Qarmet Service: ближе к рудникам, готовая инфраструктура, потенциальный якорный покупатель.</p></aside></div>
      </section>

      <section className="section risks dark" id="risks">
        <div className="section-index">04 / РИСКИ</div>
        <div className="section-head"><div><p className="eyebrow">Что может сломать проект</p><h2>Главный риск —<br />не рынок, а качество.</h2></div><p>Первая партия должна пройти испытания по стоимости метра бурения. Вылет штырей или слом резьбы может надолго закрыть доступ к крупному заказчику.</p></div>
        <div className="risk-list"><article><span>01</span><h3>Испытания на руднике</h3><p>Лицензировать технологию, пригласить опытного технолога и начать у лояльного заказчика.</p><b>Критический</b></article><article><span>02</span><h3>Конкурент в реестре</h3><p>Уточнить продукт «Жигермунайсервиса» и правила сопоставления товара в Tizilim.</p><b>Стоп-фактор</b></article><article><span>03</span><h3>Внутристрановая ценность</h3><p>Максимум операций оставить в Казахстане; методику подтвердить до инвестиций.</p><b>Высокий</b></article><article><span>04</span><h3>Ценовой демпинг</h3><p>Не спорить с FOB-ценой: продавать срок, стабильность, реестр и сервис переточки.</p><b>Управляемый</b></article></div>
      </section>

      <section className="section next" id="next">
        <div className="section-index">05 / СЛЕДУЮЩИЕ ШАГИ</div>
        <div className="next-intro"><p className="eyebrow">До инвестиционного комитета</p><h2>Шесть проверок.<br />Потом — финмодель.</h2><p>Все шаги можно пройти по открытым данным и письменным запросам. Результат должен подтвердить рынок, право на локальное преимущество и достижимую себестоимость.</p></div>
        <div className="checklist">{roadmap.map((r,i)=><article key={r[0]}><span>{String(i+1).padStart(2,"0")}</span><div><h3>{r[0]}</h3><p>{r[1]}</p></div><i aria-hidden="true" /></article>)}</div>
      </section>

      <footer><div className="footer-mark"><span className="brand-mark"><i /><i /><i /><i /></span><strong>DRILLBIT.KZ</strong></div><p>Инвестиционное исследование · Казахстан · ноябрь 2026</p><a href="#top">Наверх ↑</a></footer>
    </main>
  );
}
