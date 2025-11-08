import csv
from collections import defaultdict
import statistics

# ===== КЛАССИФИКАЦИЯ ПО СЕКТОРАМ =====
SECTORS = {
    'L1': {
        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'AVAXUSDT', 'ADAUSDT', 
        'TONUSDT', 'ATOMUSDT', 'DOTUSDT', 'ICPUSDT', 'NEARUSDT', 'APTUSDT',
        'SUIUSDT', 'FTMUSDT', 'ALGOUSDT', 'EOSUSDT', 'TRXUSDT', 'XLMUSDT',
        'XRPUSDT', 'VETUSDT', 'HBARUSDT', 'MINAUSDT', 'QTUMUSDT', 'XTZUSDT',
        'WAVESUSDT', 'EGLDUSDT', 'ZILUSDT', 'ONTUSDT', 'IOTAUSDT', 'NEOUSDT',
        'NULSUSDT', 'KDAUSDT', 'ZENUSDT'
    },
    'L2_SCALING': {
        'ARBUSDT', 'OPUSDT', 'MATICUSDT', 'IMXUSDT', 'STXUSDT', 'METISUSDT',
        'ZKUSDT', 'MANTAUSDT', 'STARKUSDT', 'BLASTUSDT', 'SCROLLUSDT',
        'BASEUSDT', 'LRCUSDT', 'SKLUSDT', 'CKBUSDT', 'CELOUSDT', 'MOVRUSDT'
    },
    'DEFI': {
        'UNIUSDT', 'AAVEUSDT', 'COMPUSDT', 'DYDXUSDT', 'GMXUSDT', 'MKRUSDT',
        'CRVUSDT', 'SUSHIUSDT', '1INCHUSDT', 'SNXUSDT', 'BALUSDT', 'YFIUSDT',
        'ENSUSDT', 'CAKEUSDT', 'PENDLEUSDT', 'AVNTUSDT', 'LDOUSDT', 'JOEUSDT',
        'ALPHAUSDT', 'ALCXUSDT', 'RADUSDT', 'PERLUSDT', 'RAREUSDT', 'FORTHUSDT',
        'ACHUSDT', 'PAXGUSDT', 'SLPUSDT', 'LOKAUSDT', 'GTCUSDT', 'IDEXUSDT'
    },
    'ORACLES_DATA': {
        'LINKUSDT', 'BANDUSDT', 'GRTUSDT', 'APIUSDT', 'API3USDT', 'TRBUSDT',
        'OCEANUSDT'
    },
    'STORAGE_COMPUTE': {
        'FILUSDT', 'ARUSDT', 'AKTUSDT', 'RENDERUSDT', 'RNDERUSDT', 'STORJUSDT',
        'SCUSDT', 'BTTSTUSDT'
    },
    'AI_ML': {
        'FETUSDT', 'AGIXUSDT', 'AIUSDT', 'NMRUSDT', 'ARKMUSDT', 'PHBUSDT',
        'AIAUSDT', 'WLDUSDT', 'NFPUSDT', 'AIXBTUSDT', 'AGLDUSDT', 'COAIUSDT',
        'VAIUSDT', 'NAORISUSDT', 'PROMPTUSDT', 'VIRTUSDT', 'ZEREBROUS DT',
        'GOATUSDT', 'GRIFFAINUSDT', 'PNUTUSDT', 'ACTUSDT'
    },
    'GAMING_METAVERSE': {
        'SANDUSDT', 'MANAUSDT', 'APEUSDT', 'GALAUSDT', 'AXSUSDT', 'ENJUSDT',
        'CHZUSDT', 'THETAUSDT', 'GMTUSDT', 'ALICEUSDT', 'TLMUSDT', 'YGGUSDT',
        'GLMUSDT', 'SFPUSDT', 'TVKUSDT', 'XPLUSDT', 'MAGICUSDT', 'PORTALUSDT',
        'PIXELUSDT', 'RONINUSDT', 'BEAMUSDT', 'PRIMEUSDT', 'XAIUSDT',
        'AGIUSDT', 'ACEUSDT', 'FUSDT', 'GLMRUSDT', 'NFTIUSDT', 'MAVUSDT',
        'BLURUSDT', 'SUPERUSDT', 'RADAMUSDT', 'COMBOUSDT', 'MCUSDT',
        'BIGTIMEUSDT', 'GASUSDT', 'NFTUSDT', 'SUNUSDT', 'POLYXUSDT',
        'VOXELUSDT', 'ALPINEUSDT', 'ASRUSDT', 'ATMUSDT', 'BARUSDT',
        'CITYUSDT', 'FORMUSDT', 'IBUSDT', 'LAZUSDT', 'MINTUSDT',
        'NAVIUSDT', 'OGUSDT', 'OMGUSDT', 'PSGUSDT', 'SANTOSUSDT',
        'VITEUSDT'
    },
    'SOCIALFI': {
        'MASKUSDT', 'PEOPLEUSDT', 'JASMYUSDT', 'CYBERUSDT', 'FRIENDUSDT',
        'WUSDT', 'REQUSDT', 'PROSUSDT', 'OXTUSDT', 'CVPUSDT', 'FRONTUSDT'
    },
    'RWA': {
        'POLYXUSDT', 'RIOUSDT', 'CFXUSDT', 'MPLUSDT', 'ONDOUSDT', 'POLSUSDT',
        'QNTUSDT', 'RLCUSDT', 'ORBSUSDT', 'LITUSDT'
    },
    'PAYMENTS': {
        'XRPUSDT', 'XLMUSDT', 'TRXUSDT', 'LTCUSDT', 'DASHUSDT', 'XMRUSDT',
        'ZECUSDT', 'BATUSDT', 'RVNUSDT'
    },
    'INTEROP': {
        'ATOMUSDT', 'DOTUSDT', 'AVAXUSDT', 'ICPUSDT', 'INJUSDT', 'TIAUSDT',
        'OSMOUSDT', 'KUJIUSDT', 'HNTUSDT', 'KLAYUSDT', 'CTXCUSDT', 'FIDAUSDT',
        'ACHUSDT', 'WANUSDT', 'SYSUSDT'
    },
    'LSD_RESTAKING': {
        'LDOUSDT', 'RPLAUSDT', 'SSWUSDT', 'FXSUSDT', 'ANKRUSDT', 'STETHUSDT',
        'ETHFIUSDT', 'REZUSDT', 'EIGENUSDT', 'SOLVUSDT', 'BBUSDT'
    },
    'CEX_UTILITY': {
        'BNBUSDT', 'CAKEUSDT', 'FTMUSDT', 'OKBUSDT', 'HTUSDT', 'KCSUSDT',
        'CRVUSDT', 'ALPHAUSDT', 'BETAUSDT'
    },
    'PRIVACY_ZK': {
        'XMRUSDT', 'ZECUSDT', 'DASHUSDT', 'SCRTUSDT', 'ROSEUSDT', 'ZKUSDT',
        'MIMUSDT', 'TORNUSDT', 'DUSKUSDT', 'PLAUSDT', 'SUPERUSDT', 'PHAUSDT',
        'ALEPHUSDT', 'MOBUSDT'
    },
    'MEME': {
        'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'FLOKIUSDT', '1000FLOKIUSDT',
        'BONKUSDT', '1000BONKUSDT', 'WIFUSDT', 'BOMEUSDT', 'MEMEUSDT',
        'MOODENGUSDT', 'POPCATUSDT', 'NEIROUSDT', 'TRUMPUSDT', 'MELANIAUSDT',
        '1000RATSUSDT', '1000LUNCUSDT', 'PUMPUSDT', 'HIPPOUSDT', '1000SATSUSDT',
        'MYROUSA', 'SAMOYDUSDT', 'SMILEYUSDT', 'KAIJUUSDT', 'XUSDT',
        'BABYDOGEUSDT', 'HOGEUSDT', 'FLOKIUSDT', 'MILKUSDT', 'EGGUSDT',
        'SPKUSDT', 'SMURFCATUSDT', 'SAHARUSDT', 'SAHARAUSDT', 'HONKUSDT',
        'HOLOOUSDT', 'MEOWUSDT', 'KERMITUSDT'
    }
}

# ===== КЛАССИФИКАЦИЯ ПО ЛИКВИДНОСТИ =====
LIQUIDITY_TIERS = {
    'T1': {  # Мейджоры: гигантская глубина, узкий спред
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT',
        'AVAXUSDT', 'DOGEUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT', 'LTCUSDT',
        'UNIUSDT', 'ATOMUSDT', 'NEARUSDT', 'ARBUSDT', 'OPUSDT', 'APTUSDT'
    },
    'T2': {  # Ликвидные mid-caps
        'SUIUSDT', 'INJUSDT', 'TIAUSDT', 'FILUSDT', 'IMXUSDT', 'RENDERUSDT',
        'GRTUSDT', 'FTMUSDT', 'AAVEUSDT', 'ICPUSDT', 'THETAUSDT', 'SANDUSDT',
        'MANAUSDT', 'AXSUSDT', 'WLDUSDT', 'AIUSDT', 'PEPEUSDT', 'SHIBUSDT',
        'WIFUSDT', 'BONKUSDT', '1000BONKUSDT', 'FLOKIUSDT', '1000FLOKIUSDT',
        'STXUSDT', 'HBARUSDT', 'ALGOUSDT', 'VETUSDT', 'QNTUSDT', 'EGLDUSDT',
        'ENSUSDT', 'ENJUSDT', 'CHZUSDT', 'GALAUSDT', 'PENDLEUSDT', 'LDOUSDT',
        'ARKMUSDT', 'ETHFIUSDT', 'FETUSDT', 'AGIXUSDT'
    },
    'T3': {  # Средние
        'MINAUSDT', 'XTZUSDT', 'ZILUSDT', 'ONTUSDT', 'IOTAUSDT', 'NEOUSDT',
        'DASHUSDT', 'ZECUSDT', 'XMRUSDT', 'BATUSDT', 'SCRTUSDT', 'ROSEUSDT',
        'DYDXUSDT', 'GMXUSDT', 'MKRUSDT', 'CRVUSDT', 'SUSHIUSDT', 'SNXUSDT',
        '1INCHUSDT', 'BALUSDT', 'COMPUSDT', 'YFIUSDT', 'BANDUSDT', 'OCEANUSDT',
        'ARUSDT', 'AKTUSDT', 'STORJUSDT', 'ALICEUSDT', 'TLMUSDT', 'YGGUSDT',
        'GLMUSDT', 'MAGICUSDT', 'APEUSDT', 'GMTUSDT', 'MASKUSDT', 'PEOPLEUSDT',
        'JASMYUSDT', 'METISUSDT', 'ZKUSDT', 'LRCUSDT', 'SKLUSDT', 'CELOUSDT',
        'API3USDT', 'TRBUSDT', 'NMRUSDT', 'POLYXUSDT', 'RIOUSDT', 'CFXUSDT',
        'KLAYUSDT', 'HNTUSDT', 'RPLAUSDT', 'FXSUSDT', 'ANKRUSDT'
    }
}

def get_sector(symbol):
    for sector, symbols in SECTORS.items():
        if symbol in symbols:
            return sector
    return 'OTHER'

def get_liquidity_tier(symbol):
    for tier, symbols in LIQUIDITY_TIERS.items():
        if symbol in symbols:
            return tier
    return 'T4'  # Default = тонкая ликвидность

def calculate_volatility_tier(atr, entry_price):
    """Вычисляет волатильность на основе ATR% от цены входа"""
    if not atr or not entry_price or entry_price == 0:
        return 'UNKNOWN'
    
    atr_percent = (float(atr) / float(entry_price)) * 100
    
    if atr_percent < 1.5:
        return 'V1'  # Низкая
    elif atr_percent < 3.0:
        return 'V2'  # Средняя
    elif atr_percent < 5.0:
        return 'V3'  # Высокая
    else:
        return 'V4'  # Экстремальная

def analyze_detailed():
    # Данные по секторам
    sector_stats = defaultdict(lambda: {'stops': 0, 'tps': 0, 'symbols': set()})
    
    # Данные по волатильности
    volatility_stats = defaultdict(lambda: {'stops': 0, 'tps': 0, 'symbols': set()})
    
    # Данные по ликвидности
    liquidity_stats = defaultdict(lambda: {'stops': 0, 'tps': 0, 'symbols': set()})
    
    # Данные по монетам для расчета волатильности
    coin_atr_data = defaultdict(list)
    
    # Читаем стопы
    with open('attached_assets/stoplosses_export_1762564994037.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            symbol = row['symbol']
            atr = row.get('atr_15m', '')
            entry_price = row.get('entry_price', '')
            
            # Сектор
            sector = get_sector(symbol)
            sector_stats[sector]['stops'] += 1
            sector_stats[sector]['symbols'].add(symbol)
            
            # Ликвидность
            liq_tier = get_liquidity_tier(symbol)
            liquidity_stats[liq_tier]['stops'] += 1
            liquidity_stats[liq_tier]['symbols'].add(symbol)
            
            # Волатильность
            if atr and entry_price:
                try:
                    vol_tier = calculate_volatility_tier(float(atr), float(entry_price))
                    volatility_stats[vol_tier]['stops'] += 1
                    volatility_stats[vol_tier]['symbols'].add(symbol)
                    coin_atr_data[symbol].append({
                        'atr': float(atr),
                        'price': float(entry_price),
                        'type': 'stop'
                    })
                except (ValueError, ZeroDivisionError):
                    pass
    
    # Читаем тейки
    with open('attached_assets/takeprofits_export_1762564921391_1762564994038.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            symbol = row['symbol']
            atr = row.get('atr_15m', '')
            entry_price = row.get('entry_price', '')
            
            # Сектор
            sector = get_sector(symbol)
            sector_stats[sector]['tps'] += 1
            sector_stats[sector]['symbols'].add(symbol)
            
            # Ликвидность
            liq_tier = get_liquidity_tier(symbol)
            liquidity_stats[liq_tier]['tps'] += 1
            liquidity_stats[liq_tier]['symbols'].add(symbol)
            
            # Волатильность
            if atr and entry_price:
                try:
                    vol_tier = calculate_volatility_tier(float(atr), float(entry_price))
                    volatility_stats[vol_tier]['tps'] += 1
                    volatility_stats[vol_tier]['symbols'].add(symbol)
                    coin_atr_data[symbol].append({
                        'atr': float(atr),
                        'price': float(entry_price),
                        'type': 'tp'
                    })
                except (ValueError, ZeroDivisionError):
                    pass
    
    # ===== АНАЛИЗ 1: ПО СЕКТОРАМ =====
    print("=" * 100)
    print("📊 АНАЛИЗ #1: ПО СЕКТОРАМ/НАРРАТИВАМ")
    print("=" * 100)
    
    sector_results = []
    for sector in sorted(sector_stats.keys()):
        data = sector_stats[sector]
        stops = data['stops']
        tps = data['tps']
        total = stops + tps
        
        if total == 0:
            continue
        
        wr = (tps / total * 100)
        unique = len(data['symbols'])
        
        sector_results.append((sector, stops, tps, total, wr, unique))
    
    # Сортировка по винрейту
    sector_results.sort(key=lambda x: x[4], reverse=True)
    
    print(f"\n{'СЕКТОР':<20} | {'СТОПОВ':<7} | {'ТЕЙКОВ':<7} | {'ВСЕГО':<6} | {'WR %':<6} | {'МОНЕТ':<6}")
    print("-" * 100)
    
    for sector, stops, tps, total, wr, unique in sector_results:
        emoji = "✅" if wr >= 50 else "⚠️" if wr >= 40 else "❌"
        print(f"{emoji} {sector:<18} | {stops:<7} | {tps:<7} | {total:<6} | {wr:>5.1f}% | {unique:<6}")
    
    # ===== АНАЛИЗ 2: ПО ВОЛАТИЛЬНОСТИ =====
    print("\n" + "=" * 100)
    print("📊 АНАЛИЗ #2: ПО ВОЛАТИЛЬНОСТИ (V-TIERS)")
    print("=" * 100)
    print("V1 = ATR < 1.5% (низкая) | V2 = 1.5-3.0% (средняя) | V3 = 3.0-5.0% (высокая) | V4 = >5% (экстрем)")
    print("=" * 100)
    
    vol_results = []
    for tier in ['V1', 'V2', 'V3', 'V4', 'UNKNOWN']:
        if tier not in volatility_stats:
            continue
        
        data = volatility_stats[tier]
        stops = data['stops']
        tps = data['tps']
        total = stops + tps
        
        if total == 0:
            continue
        
        wr = (tps / total * 100)
        unique = len(data['symbols'])
        
        vol_results.append((tier, stops, tps, total, wr, unique))
    
    print(f"\n{'TIER':<10} | {'СТОПОВ':<7} | {'ТЕЙКОВ':<7} | {'ВСЕГО':<6} | {'WR %':<6} | {'МОНЕТ':<6}")
    print("-" * 100)
    
    for tier, stops, tps, total, wr, unique in vol_results:
        emoji = "✅" if wr >= 50 else "⚠️" if wr >= 40 else "❌"
        print(f"{emoji} {tier:<8} | {stops:<7} | {tps:<7} | {total:<6} | {wr:>5.1f}% | {unique:<6}")
    
    # ===== АНАЛИЗ 3: ПО ЛИКВИДНОСТИ =====
    print("\n" + "=" * 100)
    print("📊 АНАЛИЗ #3: ПО ЛИКВИДНОСТИ (T-TIERS)")
    print("=" * 100)
    print("T1 = Мейджоры (гигантская глубина) | T2 = Mid-caps | T3 = Средние | T4 = Тонкие")
    print("=" * 100)
    
    liq_results = []
    for tier in ['T1', 'T2', 'T3', 'T4']:
        if tier not in liquidity_stats:
            continue
        
        data = liquidity_stats[tier]
        stops = data['stops']
        tps = data['tps']
        total = stops + tps
        
        if total == 0:
            continue
        
        wr = (tps / total * 100)
        unique = len(data['symbols'])
        
        liq_results.append((tier, stops, tps, total, wr, unique))
    
    print(f"\n{'TIER':<10} | {'СТОПОВ':<7} | {'ТЕЙКОВ':<7} | {'ВСЕГО':<6} | {'WR %':<6} | {'МОНЕТ':<6}")
    print("-" * 100)
    
    for tier, stops, tps, total, wr, unique in liq_results:
        emoji = "✅" if wr >= 50 else "⚠️" if wr >= 40 else "❌"
        print(f"{emoji} {tier:<8} | {stops:<7} | {tps:<7} | {total:<6} | {wr:>5.1f}% | {unique:<6}")
    
    # ===== ВЫВОДЫ =====
    print("\n" + "=" * 100)
    print("🔍 ГЛАВНЫЕ ВЫВОДЫ И ЗАВИСИМОСТИ")
    print("=" * 100)
    
    print("\n📌 ПО СЕКТОРАМ:")
    best_sectors = [s for s in sector_results if s[4] >= 50][:3]
    worst_sectors = [s for s in sector_results if s[4] < 40][-3:]
    
    if best_sectors:
        print("   ✅ ЛУЧШИЕ СЕКТОРЫ (WR >= 50%):")
        for sector, stops, tps, total, wr, unique in best_sectors:
            print(f"      • {sector}: {wr:.1f}% WR ({tps} тейков / {stops} стопов)")
    
    if worst_sectors:
        print("\n   ❌ ХУДШИЕ СЕКТОРЫ (WR < 40%):")
        for sector, stops, tps, total, wr, unique in worst_sectors:
            print(f"      • {sector}: {wr:.1f}% WR ({tps} тейков / {stops} стопов)")
    
    print("\n📌 ПО ВОЛАТИЛЬНОСТИ:")
    print("   Зависимость WR от волатильности:")
    for tier, stops, tps, total, wr, unique in vol_results:
        trend = "📈" if wr >= 45 else "📉"
        print(f"      {trend} {tier}: {wr:.1f}% WR")
    
    print("\n📌 ПО ЛИКВИДНОСТИ:")
    print("   Зависимость WR от ликвидности:")
    for tier, stops, tps, total, wr, unique in liq_results:
        trend = "📈" if wr >= 45 else "📉"
        print(f"      {trend} {tier}: {wr:.1f}% WR")
    
    print("\n📌 РЕКОМЕНДАЦИИ:")
    print("   1. Фокус на секторах с WR >= 50%")
    print("   2. Избегать секторов с WR < 35%")
    print("   3. Предпочитать монеты из T1-T2 тиров ликвидности")
    print("   4. Учитывать волатильность: умеренная (V2-V3) может быть оптимальной")
    
    print("\n" + "=" * 100)

if __name__ == '__main__':
    analyze_detailed()
