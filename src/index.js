require('dotenv-multi-x/lib/init')
const ccxt = require('ccxt')
const bn = new ccxt.binance()
// proxy
bn.httpProxy = 'http://127.0.0.1:7890/'

// 稳定币的下单价格范围
const price_range = {
    min: 0.95,
    max: 1.07,
}

const inRange = (range) => (v) => {
    return (v) => range.min && v <= range.max
}

const login = (exchange) => {
    if (process.env.KEY && process.env.SECRET) {
        exchange.apiKey = process.env.KEY
        exchange.secret = process.env.SECRET
    }
}

const inPriceRange = inRange(price_range)

const init = (exchange) => {
    let cache
    return async () => {
        if (!cache) {
            login(exchange)
            cache = await exchange.loadMarkets()
        }
        return cache
    }
}

const createOrder =
    (target, money, exchange) => async (buy, sell, side, balance) => {
        // 全仓 -> symbol
        if (side === 'buy') {
            if (balance[money].free > 0) {
                const amount = balance[money].free / buy
                console.log(
                    `#创建买单 价格 ${buy} 数量 ${amount} 花费 ${balance[money].free}`
                )
                await exchange.createOrder(
                    target + money,
                    'limit',
                    'buy',
                    amount,
                    buy
                )
                return {
                    amount,
                    price: buy,
                }
            }
        } else if (side === 'sell') {
            console.log(
                `#创建卖单 价格 ${sell} 数量 ${balance[target].free} 获得 ${
                    balance[target].free * sell
                }`
            )
            await exchange.createOrder(
                target + money,
                'limit',
                'sell',
                balance[target].free,
                sell
            )
            return {
                amount: balance[target].free,
                price: sell,
            }
        }
    }

async function main() {
    const exchange = bn
    await init(exchange)()

    const TARGET = 'USDC'
    const MONEY = 'USDT'
    const PAIR = [TARGET, MONEY]
    let market = exchange.markets[PAIR.join('/')]
    const createPairOrder = createOrder(TARGET, MONEY, exchange)
    const watcher = async () => {
        let order_book = await exchange.fetchOrderBook(market.symbol, 2)
        const balance = await exchange.fetchBalance()
        const openOrder = await exchange.fetchOpenOrders(market.symbol)
        // const orderHistory = await exchange.fetchMyTrades(usdc_usdt.symbol)
        let [buy_1_price, buy_1_amount] = order_book.bids[0]
        let [sell_1_price, sell_1_amount] = order_book.asks[0]

        if (openOrder.length) {
            // 有单就查看订单是否需要取消
            const order = openOrder[0]
            if (order.side === 'buy') {
                if (buy_1_price > order.price) {
                    // 取消单重新挂单
                    await exchange.cancelOrder(order.id, order.symbol)
                    console.log('取消订单')
                    await exchange.createOrder(
                        order.symbol,
                        'limit',
                        'buy',
                        order.amount,
                        buy_1_price
                    )
                    console.log(`#重新下单 ${buy_1_price} ${order.amount}`)
                } else {
                    console.log('等待买单成交')
                }
            } else if (order.side === 'sell') {
                if (sell_1_price < order.price) {
                    // 取消单重新挂单
                    // TODO
                } else {
                    console.log('等待卖单成交')
                }
            }
        } else {
            const balance_money = balance[MONEY]
            const balance_target = balance[TARGET]
            if (balance_money.free < 1 && balance_target.free < 1) {
                console.error('余额不足')
                return
            }
            if (!inPriceRange(buy_1_price) || !inPriceRange(sell_1_price)) {
                console.error('订单薄价格不在可控范围内')
                return
            }
            // 没单就直接下单
            await createPairOrder(
                buy_1_price,
                sell_1_price,
                balance_target.free > 1 ? 'sell' : 'buy',
                balance
            )
        }
    }

    // watcher()
    setInterval(watcher, 60 * 1000)
}

main()
