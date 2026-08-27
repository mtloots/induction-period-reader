## R side of the JS parity harness. Thinning matches the JS exactly (see parity.mjs).
suppressMessages(library(arcstat))
setwd("/Users/home/Documents/Research/Arc length statistics/kappa4_regression")
source("_oils_fitfuns.R")
q <- subset(read.csv("../kappa4_temperature/data_oils2026/trace_quality.csv"), fittable==1)
set.seed(1); pick <- q[sort(sample(nrow(q), 14)),]
out <- do.call(rbind, lapply(seq_len(nrow(pick)), function(i){
  f <- sprintf("../kappa4_temperature/data_oils2026/%s_%dC_%s.csv", pick$oil[i], pick$T_C[i], pick$rep[i])
  d <- read.csv(f); ii <- unique(round(seq(1, nrow(d), length.out=600)))
  x <- d$t_h[ii]; y <- d$cond[ii]
  fit <- fit_k4w(x,y); r <- k4_readings(fit$theta)
  data.frame(file=basename(f), n=length(x), rss=fit$rss, k=fit$theta[5], h=fit$theta[6],
             a=unname(r["a"]), b=unname(r["b"]), floor=fit$h_floor) }))
write.csv(out, "/Users/home/Documents/Research/rancimat-app/parity_R.csv", row.names=FALSE)
print(out, digits=6, row.names=FALSE)
