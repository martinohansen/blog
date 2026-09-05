importScripts(
  "./life-annuity.js?v=20260905-2",
  "./calculations.js?v=20260905-3",
);

let activeJobId = null;
let session = null;
let partitionIndex = 0;
let partitionCount = 1;

function respond(type, payload = {}) {
  self.postMessage({ type, jobId: activeJobId, ...payload });
}

self.addEventListener("message", (event) => {
  const message = event.data;

  try {
    if (message.type === "phase-one") {
      activeJobId = message.jobId;
      partitionIndex = message.partitionIndex;
      partitionCount = message.partitionCount;
      session = FireCalculations.createAnnualContributionOptimizationSession(
        message.inputs,
        new Date(message.calculationTime),
        message.searchOptions,
      );
      respond(
        "phase-one-complete",
        session.evaluateFullBudgetPartition(
          partitionIndex,
          partitionCount,
          message.resultLimit,
        ),
      );
      return;
    }

    if (!session || message.jobId !== activeJobId) {
      throw new Error("Optimeringsjobbet findes ikke længere.");
    }

    if (message.type === "phase-two") {
      respond(
        "phase-two-complete",
        session.evaluateCheapestPartition(
          message.targetFireTime,
          partitionIndex,
          partitionCount,
          message.resultLimit,
        ),
      );
      return;
    }

    if (message.type === "finalize") {
      respond("complete", {
        optimization: session.finalize(
          message.evaluations,
          message.evaluatedCandidates,
        ),
      });
      return;
    }

    throw new Error("Worker-modtog en ukendt optimeringsfase.");
  } catch (error) {
    respond("error", {
      message:
        error instanceof Error
          ? error.message
          : "Optimeringen kunne ikke gennemføres.",
    });
  }
});
