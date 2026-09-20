import {
  createFileRoute,
  Link,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import {
  AlertCircle,
  Clock,
  Loader2,
  LogIn,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useGetInvitationDetails } from "@/hooks/queries/invitation/use-get-invitation-details";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";
import { AuthLayout } from "../../components/auth/layout";

export const Route = createFileRoute("/invitation/accept/$inviteId")({
  component: AcceptInvitation,
});

function AcceptInvitation() {
  const { t } = useTranslation();
  const { inviteId } = useParams({
    from: "/invitation/accept/$inviteId",
  });
  const navigate = useNavigate();
  const [claimError, setClaimError] = useState<string | null>(null);
  const hasClaimed = useRef(false);

  const { data: session, isPending: isSessionLoading } =
    authClient.useSession();
  const {
    data: invitationData,
    isLoading: isInvitationLoading,
    error: invitationError,
  } = useGetInvitationDetails(inviteId);

  const isLoading = isSessionLoading || isInvitationLoading;
  const isSignedIn = !!session?.user;

  // El acceso ya lo concedio quien invito, asi que aqui no se pregunta nada:
  // en cuanto hay sesion, la pertenencia se materializa y se entra. Se sigue
  // usando `acceptInvitation` de better-auth porque es quien comprueba que el
  // correo de la sesion coincide con el de la invitacion.
  useEffect(() => {
    if (isLoading || !isSignedIn) return;
    if (!invitationData?.valid || !invitationData.invitation) return;
    if (hasClaimed.current) return;
    hasClaimed.current = true;

    const claim = async () => {
      try {
        const { data, error } = await authClient.organization.acceptInvitation({
          invitationId: inviteId,
        });

        if (error) {
          setClaimError(
            error.message || t("auth:invitation.toast.acceptFailed"),
          );
          return;
        }

        await authClient.organization.setActive({
          organizationId: data?.invitation.organizationId,
        });

        toast.success(t("auth:invitation.toast.acceptSuccess"));

        if (!session?.user?.name) {
          navigate({ to: "/profile-setup" });
          return;
        }

        navigate({
          to: "/dashboard/workspace/$workspaceId",
          params: { workspaceId: data?.invitation.organizationId || "" },
        });
      } catch (error) {
        setClaimError(
          error instanceof Error
            ? error.message
            : t("auth:invitation.toast.acceptFailed"),
        );
      }
    };

    void claim();
  }, [
    isLoading,
    isSignedIn,
    invitationData,
    inviteId,
    navigate,
    session?.user?.name,
    t,
  ]);

  const handleSignIn = () => {
    const email = invitationData?.invitation?.email;
    navigate({
      to: "/auth/sign-in",
      search: { invitationId: inviteId, email },
    });
  };

  // Invitees without an account need the sign-up page: sign-in cannot create
  // one. Both flows forward the invitation id, which is what allows account
  // creation on instances running with DISABLE_REGISTRATION=true.
  const handleCreateAccount = () => {
    const email = invitationData?.invitation?.email;
    navigate({
      to: "/auth/sign-up",
      search: { invitationId: inviteId, email },
    });
  };

  if (isLoading) {
    return (
      <>
        <PageTitle title={t("auth:invitation.pageTitleAccept")} />
        <AuthLayout title={t("auth:invitation.loadingTitle")}>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        </AuthLayout>
      </>
    );
  }

  if (invitationError || !invitationData) {
    return (
      <>
        <PageTitle title={t("auth:invitation.pageTitleError")} />
        <AuthLayout title={t("auth:invitation.errorTitle")}>
          <div className="space-y-4 mt-4">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-destructive/10 rounded-full">
              <XCircle className="w-6 h-6 text-destructive" />
            </div>
            <Alert variant="error">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t("auth:invitation.errorLoadDescription")}
              </AlertDescription>
            </Alert>
            <Button
              render={<Link to="/auth/sign-in" />}
              variant="outline"
              className="w-full"
            >
              {t("auth:invitation.goToSignIn")}
            </Button>
          </div>
        </AuthLayout>
      </>
    );
  }

  if (!invitationData.valid) {
    return (
      <>
        <PageTitle title={t("auth:invitation.pageTitleInvalid")} />
        <AuthLayout title={t("auth:invitation.invalidTitle")}>
          <div className="space-y-4 mt-4">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-destructive/10 rounded-full">
              {invitationData.invitation?.expired ? (
                <Clock className="w-6 h-6 text-destructive" />
              ) : (
                <XCircle className="w-6 h-6 text-destructive" />
              )}
            </div>

            <div className="space-y-3 text-center">
              <h2 className="text-lg font-semibold text-foreground">
                {invitationData.invitation?.expired
                  ? t("auth:invitation.invitationExpired")
                  : t("auth:invitation.invalidTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {invitationData.error}
              </p>
              {invitationData.invitation && (
                <p className="text-xs text-muted-foreground">
                  {t("auth:invitation.workspaceLabel", {
                    workspaceName: invitationData.invitation.workspaceName,
                  })}
                </p>
              )}
            </div>

            <Button
              render={<Link to="/auth/sign-in" />}
              variant="outline"
              className="w-full"
            >
              {t("auth:invitation.goToSignIn")}
            </Button>
          </div>
        </AuthLayout>
      </>
    );
  }

  const invitation = invitationData.invitation ?? null;

  if (!invitation) {
    return (
      <>
        <PageTitle title={t("auth:invitation.pageTitleInvalid")} />
        <AuthLayout title={t("auth:invitation.invalidTitle")}>
          <div className="space-y-4 mt-4">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-destructive/10 rounded-full">
              <XCircle className="w-6 h-6 text-destructive" />
            </div>
          </div>
        </AuthLayout>
      </>
    );
  }

  if (isSignedIn) {
    return (
      <>
        <PageTitle title={t("auth:invitation.pageTitleAccept")} />
        <AuthLayout title={t("auth:invitation.pageTitleAccept")}>
          <div className="space-y-4 mt-4">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-primary/10 rounded-full">
              <Users className="w-6 h-6 text-primary" />
            </div>

            {claimError ? (
              <>
                <Alert variant="error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{claimError}</AlertDescription>
                </Alert>
                <Button
                  render={<Link to="/dashboard" />}
                  variant="outline"
                  className="w-full"
                >
                  {t("auth:invitation.goToDashboard")}
                </Button>
              </>
            ) : (
              <div className="space-y-3 text-center">
                <h2 className="text-lg font-semibold text-foreground">
                  {t("auth:invitation.joinWorkspace", {
                    workspaceName: invitation.workspaceName,
                  })}
                </h2>
                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("auth:invitation.grantingAccess")}
                </p>
              </div>
            )}

            <div className="pt-4 border-t border-border">
              <p className="text-xs text-center text-muted-foreground">
                <Trans
                  i18nKey="auth:invitation.signedInAs"
                  values={{ email: session.user.email }}
                  components={{ email: <strong /> }}
                />
              </p>
            </div>
          </div>
        </AuthLayout>
      </>
    );
  }

  return (
    <>
      <PageTitle title={t("auth:invitation.pageTitleAccept")} />
      <AuthLayout title={t("auth:invitation.youveBeenInvited")}>
        <div className="space-y-4 mt-4">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-primary/10 rounded-full">
            <Users className="w-6 h-6 text-primary" />
          </div>

          <div className="space-y-3 text-center">
            <h2 className="text-lg font-semibold text-foreground">
              {t("auth:invitation.joinWorkspace", {
                workspaceName: invitation.workspaceName,
              })}
            </h2>
            <p className="text-sm text-muted-foreground">
              <Trans
                i18nKey="auth:invitation.inviteBodySignedOut"
                values={{ inviterName: invitation.inviterName }}
                components={{ inviter: <strong /> }}
              />
            </p>
            <p className="text-sm text-muted-foreground">
              {t("auth:invitation.createAccountOrSignIn")}
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <Button onClick={handleCreateAccount} className="w-full">
              <UserPlus className="w-4 h-4 mr-2" />
              {t("auth:invitation.createAccount")}
            </Button>

            <Button onClick={handleSignIn} variant="outline" className="w-full">
              <LogIn className="w-4 h-4 mr-2" />
              {t("auth:invitation.signIn")}
            </Button>
          </div>

          <div className="pt-4 border-t border-border">
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">
                <Trans
                  i18nKey="auth:invitation.invitationFor"
                  values={{ email: invitation.email }}
                  components={{ email: <strong /> }}
                />
              </p>
            </div>
          </div>
        </div>
      </AuthLayout>
    </>
  );
}
