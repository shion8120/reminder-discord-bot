// 概要欄の商品名（ラベル）から、記事ネタとして使うかどうかを決める。
//   gadget    … ガジェット・PC周辺・オーディオ・カメラ・スマートホーム（記事の本命）
//   appliance … 家電（掃除機・除湿機・電動歯ブラシなど）
//   life      … 生活用品（収納・掃除用品など）。サブアカウント向けに別枠で残す
//   unknown   … どれにも当たらない。残すが優先度は低い
//   null      … 捨てる（キャンペーン・サブスク・食品・医薬品・衣類・美容）

const EXCLUDE = [
  // キャンペーン・会員・サブスク・ストア
  /キャンペーン|ポイント(アップ|還元|プレゼント|獲得|付与|2重|二重|最大)|[0-9０-９,]+ ?P(ゲット|還元|獲得)|エントリー|抽選|山分け|プライム(会員|加入|入会|無料|登録|特典)|会員登録|お試し|無料体験|[0-9０-９]+ヶ月無料/,
  /Music Unlimited|Kindle ?Unlimited|kindleunlimited|Audible|オーディブル|Prime Video|プライムビデオ|ストアフロント|ほしい物リスト|欲しいものリスト|特集ページ|セール会場|会場はコチラ|会場はこちら|ギフト(カード|チャージ|券)|Mastercard|ふるさと納税|メルペイ|dポイント|エアトリ|旅行/i,
  // 食品・飲料・サプリ
  /食品|プロテイン|PROTEIN|EAA|クレアチン|サプリ|ナッツ|どら焼き|バームクーヘン|唐揚げ|ギョーザ|餃子|いちご|ブルーベリー|ご飯|パックご飯|カップヌードル|ヌードル|麺|お米|天然水|炭酸水|おいしい水|い・ろ・は・す|アクエリアス|ポカリ|オロナミン|リポビタン|レッドブル|エナジードリンク|コーヒー|お茶|飲料|ドリンク|ビール|お菓子|チョコ|ザバス|VITA POWER|マイプロテイン/i,
  // 医薬品・美容・衣類
  /頭痛薬|医薬品|錠\)|キズパワーパッド|絆創膏|ネイル|コスメ|化粧|美容液|シャンプー|スカルプ|ヘアオイル|タンクトップ|Tシャツ|スニーカー|シューズ|new balance|ニューバランス|衣類(?!乾燥)|下着|靴下|腕時計(?!.*スマート)/i
];

const GADGET = [
  // ブランド
  /Anker|CIO|UGREEN|Belkin|MATECH|TORRAS|Xiaomi|Shell|Aulumu|Soundcore|Apple|iPhone|iPad|AirPods|AirTag|Apple Watch|Apple Pencil|Magic (Mouse|Keyboard|Trackpad)|MacBook|Mac mini|iMac|Beats/i,
  /Sony|ソニー|Bose|JBL|Sennheiser|ゼンハイザー|Shokz|EDIFIER|Audioengine|Victor|JVC|audio-technica|オーディオテクニカ|Technics|Nothing|SHURE|Shure|Elgato|RODE|Insta360|DJI|Osmo|GoPro|Ulanzi|SmallRig/i,
  /Logicool|ロジクール|Logitech|Keychron|Razer|SteelSeries|CORSAIR|HyperX|FILCO|REALFORCE|HHKB|NuPhy|AIM1|MX (KEYS|ERGO|Master|Anywhere)/i,
  /Lexar|SanDisk|サンディスク|Samsung|WD\b|Western Digital|Crucial|KIOXIA|キオクシア|Transcend|BUFFALO|バッファロー|IODATA|I-O DATA|アイ・オー・データ|GRAPHT|INNOCN|KEEPTIME|BenQ|LG\b|ASUS|Dell|MSI|Acer|Lenovo|HP\b|EIZO|Hisense|ハイセンス|TCL/i,
  /エルゴトロン|Ergotron|サンワ|SANWA|エレコム|ELECOM|MUXER|Satechi|Twelve South|Domstar|ONED|Majextand|CloudValley|Soonjet|Divoom|SwitchBot|Echo|Fire TV|Fire HD|Kindle(?! ?Unlimited)|Ring\b|Nintendo|Switch 2|PlayStation|PS5|Xbox|Steam Deck|Radeon|GeForce|RTX|Ryzen|Intel|Core i|Pixel|Galaxy|Garmin|Fitbit|Oura|TP-Link|NETGEAR|Aterm|Philips Hue|Tapo/i,
  // 製品ジャンル
  /充電|チャージャー|Charger|Power ?Bank|モバイルバッテリー|バッテリー|電源タップ|Power Strip|タップ|USB|Type-?C|Lightning|ケーブル|Cable|ハブ|ドック|Dock|アダプタ|Qi2?|MagSafe|ワイヤレス/i,
  /SSD|HDD|microSD|マイクロSD|SDカード|メモリ|ストレージ|NAS|モニター|ディスプレイ|Monitor|Display|モニターアーム|ScreenBar|モニターライト|デスクライト|キーボード|Keyboard|キースイッチ|マウス|Mouse|トラックボール|ゲーミング|Gaming|ゲームパッド|コントローラー/i,
  /イヤホン|イヤフォン|Earbuds|ヘッドホン|ヘッドフォン|Headphones|ヘッドセット|スピーカー|Speaker|マイク|Mic|オーディオ|DAC|アンプ|カメラ|Camera|レンズ|三脚|ジンバル|Webカメラ|キャプチャ|Stream Deck|配信/i,
  /スマホ|スマートフォン|タブレット|ノートパソコン|ノートPC|パソコン|\bPC\b|PCスタンド|スタンド|ガジェット|ポーチ|スマートウォッチ|ウェアラブル|プロジェクター|ルーター|Wi-?Fi|メッシュ|スマートホーム|スマートロック|スマートプラグ|センサー|リモコン|電子書籍|電子ペーパー|ペンタブ|液タブ|グラフィックボード|CPU|GPU|マザーボード|電源ユニット|PCケース|クーラー|ファン/i
];

const APPLIANCE = [
  /掃除機|ロボット掃除機|DEEBOT|ECOVACS|ルンバ|Roomba|Shark|Dyson|ダイソン|除湿機|加湿器|空気清浄機|サーキュレーター|扇風機|ヒーター|ドライヤー|電動歯ブラシ|ソニッケアー|ドルツ|シェーバー|トリマー|鼻毛カッター|電気ケトル|ケトル|電子レンジ|炊飯器|トースター|コーヒーメーカー|ミキサー|ブレンダー|冷蔵庫|洗濯機|テレビ|TV\b|レコーダー|血圧計|体重計|体組成計|パワーキューブ|フィリップス|パナソニック|Panasonic|シャープ|SHARP|アイリスオーヤマ|山善|象印|タイガー|コロナ/i
];

const LIFE = [
  /収納|ボックス|ケース|ラック|ストッカー|圧縮袋|フェルト|テープ|クロス|クリーナー|洗剤|アタック|ジョイ|洗浄|スプレー|激落ち|ドライペット|除湿剤|備長炭|メジャーカップ|グラス|タンブラー|ボトル|キッチン|包丁|刃物|カッター|文房具|ボールペン|シャーペン|バッグ|リュック|チェア|椅子|デスク|マット|クッション|枕|寝具|タオル|ハンガー|ゴミ箱|焚き火台|アウトドア|キャンプ|ハコビズ/i
];

function matches(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}

function classifyProduct(label) {
  const text = label || "";
  if (!text.trim()) return "unknown";
  if (matches(EXCLUDE, text)) return null;
  if (matches(GADGET, text)) return "gadget";
  if (matches(APPLIANCE, text)) return "appliance";
  if (matches(LIFE, text)) return "life";
  return "unknown";
}

const SALE_PATTERN =
  /セール|SALE|プライムデー|Prime ?Day|ブラックフライデー|Black ?Friday|サイバーマンデー|タイムセール|感謝祭|感謝セール|スマイル|新生活|初売り|ビッグセール|爆安|値下げ|最安値|買うべき|買い時|おすすめ.{0,6}選/i;

function isSaleVideo(title, description) {
  // タイトルで判定する。概要欄はハッシュタグなどで誤爆しやすいので、先頭の数行だけ見る
  const head = (description || "").split("\n").slice(0, 3).join("\n");
  return SALE_PATTERN.test(title || "") || /セール|プライムデー|ブラックフライデー|タイムセール/.test(head);
}

module.exports = { classifyProduct, isSaleVideo };
