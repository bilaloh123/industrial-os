import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Weights for the composite ranking — cost matters most, but reliability
// and lead time both meaningfully pull the recommendation away from "just
// the cheapest" (PHASE 15: "ليس بالضرورة الأرخص").
const WEIGHT_COST = 0.4;
const WEIGHT_RELIABILITY = 0.3;
const WEIGHT_LEAD_TIME = 0.3;

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.supplier.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  async findOne(companyId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, companyId } });
    if (!supplier) throw new NotFoundException('المورد غير موجود');
    return supplier;
  }

  create(companyId: string, data: {
    name: string; country?: string; address?: string; email?: string; phone?: string;
    currency?: string; paymentTerms?: string; incoterm?: string; leadTimeDays?: number;
  }) {
    return this.prisma.supplier.create({ data: { companyId, ...data } });
  }

  // ---------------------------------------------------------------
  // SUPPLIER PERFORMANCE SCORE (PHASE 12) — derived from real purchase
  // history: the share of fully-received orders that arrived on or
  // before their expected date. A supplier with no completed history
  // yet gets the benefit of the doubt (100) rather than being penalized
  // for lack of data — but this is clearly reported to the caller so the
  // comparison table can show "no history" rather than imply certainty.
  // ---------------------------------------------------------------
  async computeReliability(companyId: string, supplierId: string): Promise<{ score: number; sampleSize: number }> {
    const completedOrders = await this.prisma.purchaseOrder.findMany({
      where: { companyId, supplierId, status: 'RECEIVED', expectedDate: { not: null } },
      select: { updatedAt: true, expectedDate: true },
    });

    if (completedOrders.length === 0) return { score: 100, sampleSize: 0 };

    const onTime = completedOrders.filter((o: any) => o.updatedAt <= (o.expectedDate as Date)).length;
    const score = Math.round((onTime / completedOrders.length) * 100);
    return { score, sampleSize: completedOrders.length };
  }

  // ---------------------------------------------------------------
  // OFFERS CATALOGUE (RFQ responses / negotiated prices)
  // ---------------------------------------------------------------
  async addOffer(companyId: string, supplierId: string, data: {
    productId: string; unitCost: number; currency?: string; leadTimeDays?: number; notes?: string;
  }) {
    await this.findOne(companyId, supplierId); // tenant-scoped existence check
    const product = await this.prisma.product.findFirst({ where: { id: data.productId, companyId, deletedAt: null } });
    if (!product) throw new NotFoundException('المنتج غير موجود');

    return this.prisma.supplierProductOffer.upsert({
      where: { supplierId_productId: { supplierId, productId: data.productId } },
      create: { companyId, supplierId, ...data },
      update: { unitCost: data.unitCost, currency: data.currency, leadTimeDays: data.leadTimeDays, notes: data.notes },
    });
  }

  // ---------------------------------------------------------------
  // COMPARISON ENGINE (PHASE 15) — ranks every supplier offering a given
  // product by a weighted composite of true cost, reliability, and lead
  // time. The cheapest offer is NOT automatically "best".
  // ---------------------------------------------------------------
  async compareForProduct(companyId: string, productId: string) {
    const offers = await this.prisma.supplierProductOffer.findMany({
      where: { companyId, productId },
      include: { supplier: true },
    });
    if (offers.length === 0) return [];

    const withReliability = await Promise.all(
      offers.map(async (offer: any) => {
        const reliability = await this.computeReliability(companyId, offer.supplierId);
        const leadTime = offer.leadTimeDays ?? offer.supplier.leadTimeDays ?? 30; // unknown lead time assumed conservative
        return { offer, reliability: reliability.score, sampleSize: reliability.sampleSize, leadTime };
      }),
    );

    const minCost = Math.min(...withReliability.map((o) => o.offer.unitCost));
    const minLeadTime = Math.min(...withReliability.map((o) => o.leadTime));

    const ranked = withReliability.map((o) => {
      // each sub-score is normalized to 0-100, where 100 is the best offer
      // in that dimension among the current candidates — so the ranking is
      // always relative to what's actually on the table, not an absolute scale.
      const costScore = (minCost / o.offer.unitCost) * 100;
      const leadTimeScore = (minLeadTime / o.leadTime) * 100;
      const reliabilityScore = o.reliability;
      const composite = WEIGHT_COST * costScore + WEIGHT_RELIABILITY * reliabilityScore + WEIGHT_LEAD_TIME * leadTimeScore;

      return {
        supplierId: o.offer.supplierId,
        supplierName: o.offer.supplier.name,
        unitCost: o.offer.unitCost,
        currency: o.offer.currency,
        leadTimeDays: o.leadTime,
        reliability: o.reliability,
        reliabilitySampleSize: o.sampleSize,
        costScore: Math.round(costScore),
        leadTimeScore: Math.round(leadTimeScore),
        compositeScore: Math.round(composite),
        best: false,
      };
    });

    ranked.sort((a, b) => b.compositeScore - a.compositeScore);
    if (ranked.length > 0) ranked[0].best = true;

    return ranked;
  }
}
