(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.LifeAnnuityCalculations = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BENCHMARK_YEAR = 2024;
  const MAX_AGE = 110;

  // Finanstilsynets 2024 benchmarks for current mortality and expected
  // longevity improvements. The calculation uses a transparent 50/50
  // unisex population, as in Finanstilsynet's own life-annuity example.
  // Source: https://www.finanstilsynet.dk/finansielle-temaer/
  // forsikring-og-pension/levetidsmodel
  const FEMALE_MORTALITY = Object.freeze([
    0.003685712328, 0.0001049362684, 8.173374278e-5, 8.133155202e-5,
    8.250406336e-5, 8.237395898e-5, 7.897717288e-5, 7.640148194e-5,
    7.040724913e-5, 6.489992e-5, 6.247310525e-5, 6.388763425e-5,
    6.816635807e-5, 7.429001427e-5, 8.139537299e-5, 8.728300676e-5,
    9.628102326e-5, 0.0001049588327, 0.000113622805,
    0.0001224522806, 0.0001297452818, 0.0001385636398,
    0.0001507156074, 0.0001617888535, 0.0001662146813,
    0.0001638237491, 0.0001498459221, 0.000130808859,
    0.0001172802872, 0.000112996325, 0.0001246664317,
    0.0001474766351, 0.0001804550813, 0.0002125186092,
    0.0002358727391, 0.000255483671, 0.0002696976957,
    0.0002784667066, 0.0003013194038, 0.0003314166929,
    0.0003697133171, 0.0004209092854, 0.0004770550485,
    0.0005210034916, 0.0005816578378, 0.0006515585894,
    0.0007245571009, 0.0008306197265, 0.0009437151364,
    0.001046895082, 0.00115924327, 0.001271321711, 0.001387854892,
    0.001544895481, 0.001727382063, 0.001939347614, 0.002205463793,
    0.00248510109, 0.002798221341, 0.00313369666, 0.003482044687,
    0.003871705667, 0.004330751435, 0.004876925108, 0.005530558702,
    0.006292632011, 0.007099538621, 0.007967073346, 0.008833649557,
    0.009708582671, 0.01064847568, 0.01162414429, 0.01270129524,
    0.01398541469, 0.0154686966, 0.01707928728, 0.01903970749,
    0.02117910858, 0.02370875103, 0.02677606963, 0.03042775305,
    0.03478951936, 0.03965409645, 0.045447428, 0.05218036651,
    0.06037640911, 0.07039322369, 0.08237601182, 0.09609489481,
    0.1115706409, 0.1286962664, 0.147416252, 0.1683496839,
    0.1914923173, 0.217151944, 0.2453214355, 0.2758215385,
    0.3085277058, 0.3432406898, 0.3796861655, 0.4175195798,
    0.4563365012, 0.4956880771, 0.5351005117, 0.5740968913,
    0.6122193255, 0.6490493189, 0.6842245597, 0.7189335404,
    0.7512853946, 0.7809340606,
  ]);
  const MALE_MORTALITY = Object.freeze([
    0.004137570002, 0.0001691827751, 0.0001483122055,
    0.0001035935103, 8.06058245e-5, 6.76488611e-5, 5.387928698e-5,
    4.662895723e-5, 4.305421808e-5, 3.911568515e-5, 4.189262632e-5,
    4.939213465e-5, 6.259535845e-5, 8.314754817e-5,
    0.0001089121755, 0.0001413198517, 0.0001776739761,
    0.0002199287716, 0.0002569422653, 0.0002889200153,
    0.000309839736, 0.0003162082364, 0.0003209354166,
    0.0003236812789, 0.0003271966067, 0.0003281213263,
    0.0003210425355, 0.0003042244509, 0.0002939046886,
    0.0002998262036, 0.0003268401063, 0.0003725606998,
    0.0004223632898, 0.0004646363074, 0.0004889801805,
    0.0005122117093, 0.0005411406967, 0.0005762453556,
    0.0006310380901, 0.0006969873621, 0.0007636422766,
    0.0008423562486, 0.0009493525618, 0.001061798097,
    0.001176580702, 0.00129948703, 0.001413507349, 0.001540462895,
    0.00168800368, 0.00187165114, 0.002088146449, 0.002347133888,
    0.002639507221, 0.002930476426, 0.003244089774, 0.003567451691,
    0.003913237421, 0.00430221638, 0.00476557503, 0.005278722157,
    0.005885483816, 0.006581441634, 0.007299319474, 0.008133967766,
    0.00901422143, 0.009993137171, 0.01113514132, 0.01242660405,
    0.01384337094, 0.01543525765, 0.01702466155, 0.01868842956,
    0.02051425872, 0.02242353594, 0.02467223058, 0.02726159525,
    0.03013469787, 0.03339900469, 0.03717746811, 0.04122378576,
    0.04613465826, 0.05162175232, 0.05756351454, 0.0646298272,
    0.072736164, 0.08298760243, 0.09550211516, 0.1105880216,
    0.1280078247, 0.1474518681, 0.1683775517, 0.1911022953,
    0.2157099058, 0.2420799568, 0.2709976143, 0.3017241498,
    0.3343035089, 0.3685127725, 0.4040700497, 0.4406415432,
    0.4778525769, 0.5153019427, 0.5525784865, 0.5892785418,
    0.6250227054, 0.6594705386, 0.6923320722, 0.7233754148,
    0.7538563543, 0.7819501461, 0.8074880865,
  ]);
  const FEMALE_IMPROVEMENT = Object.freeze([
    0.004672757477, 0.0814156636, 0.06848756936, 0.03446520154,
    0.02197522044, 0.02404408293, 0.03258092201, 0.04734791164,
    0.0654832711, 0.0771639027, 0.07710341119, 0.06795554601,
    0.0548449228, 0.04354039246, 0.03787770566, 0.0369237606,
    0.03837415796, 0.03724571408, 0.03212147124, 0.02625461748,
    0.02033589231, 0.01507822758, 0.01137850204, 0.01020578407,
    0.01060936418, 0.01168213191, 0.01449217133, 0.01802471085,
    0.02024073278, 0.02210073855, 0.02032076605, 0.0175296133,
    0.01616151026, 0.01548386049, 0.01715546907, 0.01974928205,
    0.02183409062, 0.02270803383, 0.023174582, 0.0240470939,
    0.026036912, 0.02918669658, 0.03247644298, 0.03606191964,
    0.03827369624, 0.03966688486, 0.04049061449, 0.04013437109,
    0.03950349056, 0.0390372638, 0.03884798461, 0.03886793587,
    0.03935942018, 0.03928400105, 0.03830280966, 0.03677108173,
    0.0340905905, 0.03148089958, 0.02905816677, 0.02712775959,
    0.02567608705, 0.02445951122, 0.02337367424, 0.02200157765,
    0.02032251691, 0.01865843094, 0.01752667479, 0.0168431156,
    0.01715248422, 0.01814540786, 0.01952912233, 0.02103050939,
    0.0224295316, 0.02345713608, 0.02396394501, 0.02408887669,
    0.02401694541, 0.02357213215, 0.02295359121, 0.02230707857,
    0.02134132534, 0.02004864127, 0.01870449699, 0.01705197113,
    0.01527259983, 0.0136214349, 0.01207399299, 0.01056537858,
    0.009324263318, 0.008229698537, 0.00715981161, 0.006162601135,
    0.005073995861, 0.004158049172, 0.003296478515, 0.002427771634,
    0.001857096247, 0.001343458448, 0.0007014909673,
    0.0002049495093, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const MALE_IMPROVEMENT = Object.freeze([
    0.007830581991, 0.0353174557, 0.01977678389, 0.0509412934,
    0.05195873149, 0.04521977948, 0.04464746697, 0.05009387969,
    0.05742906145, 0.06237819118, 0.06536537744, 0.06135371838,
    0.04930021277, 0.04055131972, 0.03358324943, 0.03355593421,
    0.0365478018, 0.04069174248, 0.04336792885, 0.04522005848,
    0.04506204109, 0.04289617381, 0.04078335604, 0.03817919043,
    0.03586960963, 0.03362120108, 0.03229239497, 0.031701843,
    0.03119194261, 0.03049856776, 0.03001377111, 0.02876647666,
    0.02775525183, 0.0271441085, 0.0264387138, 0.02538315502,
    0.02504107674, 0.02546328443, 0.0262951001, 0.02836512676,
    0.03106028077, 0.0325172374, 0.03338390654, 0.03383722139,
    0.03363666146, 0.03378103108, 0.03459014838, 0.03580008945,
    0.03687332634, 0.03821950295, 0.03929473997, 0.03945949238,
    0.03929474149, 0.03856428437, 0.03657983067, 0.03438710278,
    0.03222191015, 0.0296154901, 0.02749315578, 0.02599291393,
    0.02435559153, 0.02288029673, 0.02178093674, 0.02042039965,
    0.01925976843, 0.01838795131, 0.01750728691, 0.01681848745,
    0.0165594822, 0.01652166836, 0.01711371241, 0.01822403052,
    0.01960812644, 0.02087557014, 0.02185037644, 0.0225720391,
    0.02288173308, 0.02298151358, 0.0229342745, 0.02257649294,
    0.02183649262, 0.02103432269, 0.02003554531, 0.01898880572,
    0.01783615879, 0.01637652584, 0.01455115143, 0.01239133832,
    0.01021310022, 0.008362940544, 0.00680064756, 0.005439676983,
    0.004403484718, 0.003285343572, 0.001894671909,
    0.0008738819712, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0,
  ]);

  function mortalityIntensity(age, year, mortality, improvement) {
    if (age < 0 || age > MAX_AGE) {
      return age > MAX_AGE ? Number.POSITIVE_INFINITY : 0;
    }

    return mortality[age] * Math.pow(1 - improvement[age], year - BENCHMARK_YEAR);
  }

  function calculateLifeAnnuityMetrics({
    retirementAge,
    retirementYear,
    realReturnRates,
    discountRates = realReturnRates,
    guaranteeYears = 0,
  }) {
    if (!Number.isInteger(retirementAge) || retirementAge < 0) {
      throw new Error("Livrentens pensionsalder skal være et positivt helt tal.");
    }
    if (!Number.isInteger(retirementYear)) {
      throw new Error("Livrentens pensionsår skal være et helt tal.");
    }
    if (!Array.isArray(discountRates) || discountRates.length === 0) {
      throw new Error("Livrentens afkast skal indeholde mindst ét år.");
    }
    if (!Number.isInteger(guaranteeYears) || guaranteeYears < 0) {
      throw new Error("Livrentens garantiperiode skal være 0 eller flere år.");
    }

    if (retirementAge > MAX_AGE) {
      return {
        annuityFactor: 1,
        conversionRate: 1,
        expectedAgeAtDeath: retirementAge,
        expectedRemainingLifetime: 0,
        pureLifeAnnuityFactors: [1],
      };
    }

    const periods = MAX_AGE - retirementAge + 1;
    let femaleSurvival = 1;
    let maleSurvival = 1;
    let discountFactor = 1;
    let annuityFactor = 0;
    let expectedRemainingLifetime = 0;
    const survivalProbabilities = [];

    for (let period = 0; period < periods; period += 1) {
      const unisexSurvival = (femaleSurvival + maleSurvival) / 2;
      survivalProbabilities.push(unisexSurvival);
      const paymentProbability =
        period < guaranteeYears ? 1 : unisexSurvival;
      annuityFactor += paymentProbability / discountFactor;

      const age = retirementAge + period;
      const year = retirementYear + period;
      const femaleNextSurvival =
        femaleSurvival *
        Math.exp(
          -mortalityIntensity(
            age,
            year,
            FEMALE_MORTALITY,
            FEMALE_IMPROVEMENT,
          ),
        );
      const maleNextSurvival =
        maleSurvival *
        Math.exp(
          -mortalityIntensity(
            age,
            year,
            MALE_MORTALITY,
            MALE_IMPROVEMENT,
          ),
        );
      const nextUnisexSurvival =
        (femaleNextSurvival + maleNextSurvival) / 2;
      expectedRemainingLifetime +=
        (unisexSurvival + nextUnisexSurvival) / 2;

      femaleSurvival = femaleNextSurvival;
      maleSurvival = maleNextSurvival;
      const rate = discountRates[Math.min(period, discountRates.length - 1)];
      if (!Number.isFinite(rate) || rate <= -1) {
        throw new Error("Livrentens diskonteringsrente skal være større end -100 %.");
      }
      discountFactor *= 1 + rate;
    }

    if (!Number.isFinite(annuityFactor) || annuityFactor <= 0) {
      throw new Error("Livrentens omregningsfaktor kunne ikke beregnes.");
    }

    // Reserve per unit of annual income, conditional on surviving to each
    // anniversary. Preserve the original cohort's changing female/male mix.
    // These factors describe a pure life annuity, without a guarantee.
    const pureLifeAnnuityFactors = Array(periods).fill(1);
    for (let period = periods - 2; period >= 0; period -= 1) {
      const survival = survivalProbabilities[period + 1] /
        survivalProbabilities[period];
      const rate = discountRates[Math.min(period, discountRates.length - 1)];
      pureLifeAnnuityFactors[period] += survival *
        pureLifeAnnuityFactors[period + 1] / (1 + rate);
    }

    return {
      annuityFactor,
      conversionRate: 1 / annuityFactor,
      expectedAgeAtDeath: retirementAge + expectedRemainingLifetime,
      expectedRemainingLifetime,
      pureLifeAnnuityFactors,
    };
  }

  return {
    BENCHMARK_YEAR,
    MAX_AGE,
    calculateLifeAnnuityMetrics,
  };
});
