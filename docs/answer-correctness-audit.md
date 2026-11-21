# Answer correctness audit

Baseline: `refactor/generator-folders` at `96a81f3`, before the every-Topic Answer checks. Class A has an independent mathematical comparison between baked inputs and baked outputs. It can still have coverage gaps, noted below. Class B has mathematical tests but relies on construction data or production math to establish correctness. Class C has only weak checks or none. The classification concerns the Answer, not rendering, determinism or variety.

Of 70 Topics, 55 were class A, 15 were class B, and 0 were class C.

| Topic id | Class | Baseline evidence |
| --- | --- | --- |
| quadratic-factoring | B | Substitutes constructed roots into the constructed coefficients. |
| quadratic-formula | B | Checks exact real and imaginary roots using the construction's discriminant and root representation. |
| completing-the-square | B | Verifies the constructed exact root against the constructed polynomial. |
| parabola-properties | B | Checks the vertex and intercepts from the construction's facts. |
| graphing-quadratics | B | Compares the curve and printed features with the chosen vertex and roots. |
| quadratic-inequalities | A | Parses both printed sides and exactly checks endpoint zeros and inclusion. Interior probes reuse the production endpoint-to-number conversion. |
| one-step-equations | A | Substitutes the printed solution and tries a nearby nonsolution. |
| two-step-equations | A | Evaluates the printed equation at the printed root and a different value. |
| multi-step-equations | A | Evaluates the printed root or compares the two sides at several points for special cases. |
| absolute-value-equations | A | Substitutes printed roots. Root-count and no-solution checks use the constructed corner. |
| literal-equations | A | Substitutes the printed expression for the requested subject with varied bindings. |
| slope | B | Computes rise and run from constructed points. |
| parallel-perpendicular-slopes | B | Classifies directions using the constructed lines and shared slope operations. |
| graphing-linear-equations | B | Checks the printed equation at constructed points and compares the key with the constructed slope and intercept. |
| writing-linear-equations | B | Evaluates the printed equation at points supplied by the construction. |
| systems-graphing | A | Independently classifies the printed equations and compares the printed point or special case. |
| systems-elimination | A | Recovers coefficients from the printed equations and checks the resulting solution set. |
| systems-substitution | A | Classifies the baked system and compares it with the baked Answer. |
| graphing-inequalities | A | Compares plotted set membership with the printed inequality in both directions. The prose description uses the production formatter. |
| one-step-inequalities | A | Compares printed inequality and Answer membership at and around boundaries. |
| two-step-inequalities | A | Compares printed inequality and Answer membership at and around boundaries. |
| multi-step-inequalities | A | Probes both printed sets, including all-real and empty sets. |
| compound-inequalities | A | Evaluates printed chains, conjunctions and disjunctions against the printed solution set. |
| absolute-value-inequalities | A | Evaluates the printed absolute value and probes the printed set and its endpoints. |
| general-sequences | A | Generates the requested terms by evaluating the printed explicit or recursive rule. |
| arithmetic-sequences | A | Infers the difference and first term from printed givens, then checks the term or rule. |
| geometric-sequences | A | Recovers the ratio from the printed terms and checks the requested term or rule. |
| arithmetic-geometric-means | A | Inserts the printed means and checks every gap or ratio, including its requested sign. |
| arithmetic-series | A | Reconstructs and sums every term from the printed notation. |
| geometric-series | A | Reads the ratio and length, then sums or tests convergence. |
| exponential-common-base | A | Substitutes the printed root and compares the logarithms of both sides, including very small powers. |
| log-exponential-form | B | Uses construction bindings and quantities to decide whether both printed equations state the same fact. |
| evaluating-logarithms | A | Evaluates the printed logarithm and Answer independently. |
| log-properties | A | Compares printed expressions at positive variable bindings and checks the number of logs. |
| exponential-equations-logs | A | Substitutes the exact Answer and checks decimal rounding against it. |
| logarithmic-equations | A | Substitutes each stated root in the printed equation. Extraneous-root checks also use construction data. |
| counting-principle | B | Multiplies constructed stages and checks that the prompt contains the relevant numbers. |
| permutations | B | Recounts notation and repeated symbols independently, but uses constructed counts for word scenarios. |
| combinations | B | Recounts notation independently, but uses constructed group sizes and selection counts for word scenarios. |
| permutations-vs-combinations | B | Reads the Answer but takes the kind, population and selection size from the construction. |
| binomial-theorem | A | Reads the binomial and request, then samples the expansion or computes the requested coefficient and powers. |
| matrix-operations | A | Parses and evaluates the printed matrix expression, including incompatible shapes. |
| determinants | A | Computes the Leibniz determinant of the printed matrix. |
| matrix-inverses | A | Multiplies the printed matrices both ways or checks singularity. |
| cramers-rule | A | Substitutes the printed tuple into every printed equation. |
| naming-polynomials | B | Reads degree and term count, but uses the production naming function for the expected text. |
| adding-subtracting-polynomials | A | Evaluates the printed sum or difference and Answer at common probe points. |
| multiplying-polynomials | A | Evaluates the printed product and expanded Answer at common probe points. |
| special-products | A | Compares the printed power or product with the expanded polynomial at probe points. |
| dividing-polynomials | A | Evaluates the printed quotient independently of the construction's product identity. |
| factoring-gcf | A | Evaluates printed factors against the polynomial. Greatest-factor checks inspect construction data. |
| factoring-quadratics | A | Checks printed factor products at probe points. Prime and primitive-factor checks use construction data. |
| factoring-special-cases | A | Evaluates the printed factorization against the original at probe points. |
| factoring-by-grouping | A | Compares printed product and polynomial values. Complete-factor checks also inspect construction data. |
| simplifying-radicals | A | Evaluates the printed expressions and inspects printed radicands for remaining powers. |
| distance-formula | A | Reads both points and recomputes the distance and rounding. |
| midpoint-formula | A | Reads the printed coordinates and checks their midpoint relation. |
| adding-radicals | A | Checks printed equality and radical simplification. Like-term checks also use construction data. |
| multiplying-radicals | A | Evaluates the product and inspects printed radicands. Like-term checks also use construction data. |
| dividing-radicals | A | Evaluates printed numerator and denominator and checks rationalization. |
| radical-equations | A | Substitutes stated roots. Empty-answer and completeness checks rely on the construction. |
| order-of-operations | A | Uses independent arithmetic precedence to evaluate the printed expression. |
| classifying-numbers | A | Reads the number or repeating pattern and derives its number sets independently. |
| adding-subtracting-rationals | A | Parses mixed numbers and evaluates the printed arithmetic. |
| multiplying-rationals | A | Compares the printed Answer to independently evaluated factors. |
| dividing-rationals | A | Compares the printed Answer to independently evaluated division. |
| distributive-property | A | Compares both expressions under substitution. Uses the construction only to identify the variable. |
| solving-proportions | A | Substitutes the printed solution into the printed ratios and rejects a nearby value. |
| percents | A | Reads the question wording and computes the requested part, whole or percent. |
| percent-of-change | A | Recomputes change and direction or the updated amount from the printed numbers. |
