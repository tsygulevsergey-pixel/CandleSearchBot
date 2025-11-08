import csv
from collections import defaultdict
import json

MEME_COINS = {
    'BOMEUSDT', 'WIFUSDT', 'PEOPLEUSDT', '1000SATSUSDT', '1000BONKUSDT',
    'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', '1000FLOKIUSDT', 'BONKUSDT',
    'MOODENGUSDT', 'POPCATUSDT', 'NEIROUSDT', 'TRUMPUSDT', 'MELANIAUSDT',
    '1000RATSUSDT', '1000LUNCUSDT', 'PUMPUSDT', 'HIPPOUSDT'
}

TOP_COINS = {
    'BTCDOMUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
    'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT',
    'LTCUSDT', 'NEARUSDT', 'UNIUSDT', 'ATOMUSDT', 'APTUSDT',
    'SUIUSDT', 'FILUSDT', 'AAVEUSDT', 'RENDERUSDT', 'INJUSDT',
    'ARBUSDT', 'OPUSDT', 'TIAUSDT', 'TAOUSDT', 'WLDUSDT'
}

def classify_coin(symbol):
    if symbol in MEME_COINS:
        return 'МЕМКОИНЫ'
    elif symbol in TOP_COINS:
        return 'ТОПОВЫЕ'
    else:
        return 'СРЕДНИЕ'

def analyze_files():
    stop_data = defaultdict(lambda: {'count': 0, 'symbols': []})
    tp_data = defaultdict(lambda: {'count': 0, 'symbols': []})
    
    coin_stats = defaultdict(lambda: {'stops': 0, 'tps': 0, 'category': ''})
    
    with open('attached_assets/stoplosses_export_1762564994037.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            symbol = row['symbol']
            category = classify_coin(symbol)
            
            stop_data[category]['count'] += 1
            stop_data[category]['symbols'].append(symbol)
            
            coin_stats[symbol]['stops'] += 1
            coin_stats[symbol]['category'] = category
    
    with open('attached_assets/takeprofits_export_1762564921391_1762564994038.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            symbol = row['symbol']
            category = classify_coin(symbol)
            
            tp_data[category]['count'] += 1
            tp_data[category]['symbols'].append(symbol)
            
            coin_stats[symbol]['tps'] += 1
            if not coin_stats[symbol]['category']:
                coin_stats[symbol]['category'] = category
    
    print("=" * 80)
    print("📊 АНАЛИЗ СТОП-ЛОССОВ И ТЕЙК-ПРОФИТОВ ПО ТИПАМ МОНЕТ")
    print("=" * 80)
    
    total_stops = sum(d['count'] for d in stop_data.values())
    total_tps = sum(d['count'] for d in tp_data.values())
    
    print(f"\n🔴 ВСЕГО СТОПОВ: {total_stops}")
    print(f"🟢 ВСЕГО ТЕЙКОВ: {total_tps}")
    print(f"📈 WIN RATE: {(total_tps / (total_stops + total_tps) * 100):.1f}%")
    print()
    
    for category in ['МЕМКОИНЫ', 'ТОПОВЫЕ', 'СРЕДНИЕ']:
        stops = stop_data[category]['count']
        tps = tp_data[category]['count']
        total = stops + tps
        
        if total == 0:
            continue
            
        win_rate = (tps / total * 100) if total > 0 else 0
        
        print("=" * 80)
        print(f"🏷️  {category}")
        print("=" * 80)
        print(f"🔴 Стопов: {stops} ({stops/total_stops*100:.1f}% от всех стопов)")
        print(f"🟢 Тейков: {tps} ({tps/total_tps*100:.1f}% от всех тейков)")
        print(f"📊 Всего сигналов: {total}")
        print(f"📈 Win Rate: {win_rate:.1f}%")
        print()
    
    print("\n" + "=" * 80)
    print("🎯 ТОП-20 МОНЕТ ПО СТОПАМ (ХУДШИЕ)")
    print("=" * 80)
    
    sorted_by_stops = sorted(
        [(symbol, data) for symbol, data in coin_stats.items() if data['stops'] > 0],
        key=lambda x: x[1]['stops'],
        reverse=True
    )[:20]
    
    for i, (symbol, data) in enumerate(sorted_by_stops, 1):
        total = data['stops'] + data['tps']
        wr = (data['tps'] / total * 100) if total > 0 else 0
        print(f"{i:2d}. {symbol:20s} | {data['category']:12s} | Стопов: {data['stops']:2d} | Тейков: {data['tps']:2d} | WR: {wr:5.1f}%")
    
    print("\n" + "=" * 80)
    print("💎 ТОП-20 МОНЕТ ПО ТЕЙКАМ (ЛУЧШИЕ)")
    print("=" * 80)
    
    sorted_by_tps = sorted(
        [(symbol, data) for symbol, data in coin_stats.items() if data['tps'] > 0],
        key=lambda x: x[1]['tps'],
        reverse=True
    )[:20]
    
    for i, (symbol, data) in enumerate(sorted_by_tps, 1):
        total = data['stops'] + data['tps']
        wr = (data['tps'] / total * 100) if total > 0 else 0
        print(f"{i:2d}. {symbol:20s} | {data['category']:12s} | Тейков: {data['tps']:2d} | Стопов: {data['stops']:2d} | WR: {wr:5.1f}%")
    
    print("\n" + "=" * 80)
    print("⚖️  МОНЕТЫ С БАЛАНСОМ (>=3 СИГНАЛОВ)")
    print("=" * 80)
    
    balanced = []
    for symbol, data in coin_stats.items():
        total = data['stops'] + data['tps']
        if total >= 3:
            wr = (data['tps'] / total * 100) if total > 0 else 0
            balanced.append((symbol, data, wr, total))
    
    balanced_sorted = sorted(balanced, key=lambda x: x[2], reverse=True)
    
    for symbol, data, wr, total in balanced_sorted[:30]:
        print(f"{symbol:20s} | {data['category']:12s} | Всего: {total:2d} | Тейков: {data['tps']:2d} | Стопов: {data['stops']:2d} | WR: {wr:5.1f}%")
    
    print("\n" + "=" * 80)
    print("🔍 ВЫВОДЫ И ЗАВИСИМОСТИ")
    print("=" * 80)
    
    for category in ['МЕМКОИНЫ', 'ТОПОВЫЕ', 'СРЕДНИЕ']:
        stops = stop_data[category]['count']
        tps = tp_data[category]['count']
        total = stops + tps
        
        if total == 0:
            continue
        
        unique_symbols_stops = len(set(stop_data[category]['symbols']))
        unique_symbols_tps = len(set(tp_data[category]['symbols']))
        unique_symbols_total = len(set(stop_data[category]['symbols'] + tp_data[category]['symbols']))
        
        avg_stops_per_coin = stops / unique_symbols_stops if unique_symbols_stops > 0 else 0
        avg_tps_per_coin = tps / unique_symbols_tps if unique_symbols_tps > 0 else 0
        
        print(f"\n📌 {category}:")
        print(f"   • Уникальных монет всего: {unique_symbols_total}")
        print(f"   • Среднее стопов на монету: {avg_stops_per_coin:.1f}")
        print(f"   • Среднее тейков на монету: {avg_tps_per_coin:.1f}")
        print(f"   • Win Rate: {(tps/total*100):.1f}%")
        
        if stops > tps:
            print(f"   ❌ ВЫВОД: Чаще уходят в стопы (разница {stops-tps})")
        elif tps > stops:
            print(f"   ✅ ВЫВОД: Чаще берут тейки (разница {tps-stops})")
        else:
            print(f"   ⚖️  ВЫВОД: Баланс между стопами и тейками")

if __name__ == '__main__':
    analyze_files()
